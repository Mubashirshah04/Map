const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 🛡️ OMEGA DATA RESCUE TOOL (v1.0)
// Designed to salvage tiles from a corrupted tiles.db after sudden power loss.

const OLD_DB = path.join(__dirname, 'tiles.db');
const NEW_DB = path.join(__dirname, 'tiles_recovered.db');

console.log("\n💎 OMEGA DATA RESCUE INITIATED...");
console.log("---------------------------------");

if (!fs.existsSync(OLD_DB)) {
    console.error("❌ ERROR: 'tiles.db' not found in this folder!");
    process.exit(1);
}

// ⚠️ Check for existing recovery file to avoid overwriting
if (fs.existsSync(NEW_DB)) {
    console.log("⚠️ Existing 'tiles_recovered.db' found. Deleting to start fresh...");
    fs.unlinkSync(NEW_DB);
}

const dbOld = new sqlite3.Database(OLD_DB);
const dbNew = new sqlite3.Database(NEW_DB);

dbNew.serialize(() => {
    // 🏗️ Reconstruct Tables
    dbNew.run("CREATE TABLE IF NOT EXISTS downloads (city TEXT PRIMARY KEY, status TEXT, size_mb REAL, completed_tiles INTEGER, total_tiles INTEGER, bbox TEXT)");
    dbNew.run("CREATE TABLE IF NOT EXISTS tiles (layer TEXT, z INTEGER, x INTEGER, y INTEGER, data BLOB, PRIMARY KEY(layer, z, x, y))");
    
    // 🚀 High-Speed Recovery Settings
    dbNew.run("PRAGMA journal_mode = WAL");
    dbNew.run("PRAGMA synchronous = OFF");

    console.log("📡 Step 1: Recovering Download Progress Info...");
    dbOld.all("SELECT * FROM downloads", [], (err, rows) => {
        if (err) {
            console.warn("⚠️ Could not recover 'downloads' table. Skipping...");
        } else if (rows) {
            rows.forEach(r => {
                dbNew.run("INSERT OR REPLACE INTO downloads VALUES (?,?,?,?,?,?)", 
                    [r.city, r.status, r.size_mb, r.completed_tiles, r.total_tiles, r.bbox]);
            });
            console.log(`✅ Recovered ${rows.length} mission records.`);
        }
    });

    console.log("📦 Step 2: Salvaging Tiles (Processing 159GB+, please wait)...");
    let count = 0;
    let corruptedCount = 0;

    // Use .each to stream data and avoid OOM
    dbOld.each("SELECT * FROM tiles", (err, row) => {
        if (err) {
            corruptedCount++;
            if (corruptedCount % 100 === 0) console.log(`⚠️ Skipped ${corruptedCount} corrupted tiles...`);
            return;
        }

        dbNew.run("INSERT OR IGNORE INTO tiles (layer, z, x, y, data) VALUES (?,?,?,?,?)", 
            [row.layer, row.z, row.x, row.y, row.data]);
        
        count++;
        if (count % 10000 === 0) {
            process.stdout.write(`\r🧩 Recovered: ${count} tiles | Skipped: ${corruptedCount} bad sectors...`);
        }
    }, (err) => {
        if (err) console.error("\n❌ Fatal stream error:", err.message);
        
        console.log(`\n\n✨ RESCUE MISSION FINISHED!`);
        console.log(`✅ Successfully Saved: ${count} tiles.`);
        console.log(`⚠️ Permanently Lost: ${corruptedCount} tiles.`);
        console.log("---------------------------------");
        console.log("👉 NEXT STEPS:");
        console.log("1. Close this terminal.");
        console.log("2. Rename 'tiles.db' to 'tiles_broken.db' (Backup).");
        console.log("3. Rename 'tiles_recovered.db' to 'tiles.db'.");
        console.log("4. Start 'node server.js' and resume your harvest!");
        
        dbOld.close();
        dbNew.close();
        process.exit();
    });
});
