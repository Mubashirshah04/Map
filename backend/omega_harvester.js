const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'wwwroot', 'data', 'pakistan_omega.mbtiles');
const db = new sqlite3.Database(DB_PATH);

// 🛡️ OMEGA HARVESTER SCHEMA: Using the power of Deduplication
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS imagery_blobs (hash TEXT PRIMARY KEY, data BLOB)");
    db.run("CREATE TABLE IF NOT EXISTS map_index (z INTEGER, x INTEGER, y INTEGER, layer TEXT, hash TEXT, PRIMARY KEY(z, x, y, layer))");
});

const PAKISTAN_BBOX = { north: 37.1, south: 23.6, west: 60.8, east: 77.8 };
const LAYERS = ['google-street', 'satellite', 'hybrid-labels'];

async function harvestArea(z_min, z_max) {
    console.log(`🚀 OMEGA HARVESTER STARTING: Zoom ${z_min} to ${z_max}`);
    
    for (let z = z_min; z <= z_max; z++) {
        const nw = latLngToTile(PAKISTAN_BBOX.north, PAKISTAN_BBOX.west, z);
        const se = latLngToTile(PAKISTAN_BBOX.south, PAKISTAN_BBOX.east, z);
        
        console.log(`📡 Level ${z}: Processing ${ (se.x - nw.x + 1) * (se.y - nw.y + 1) } locations...`);

        for (let x = nw.x; x <= se.x; x++) {
            for (let y = nw.y; y <= se.y; y++) {
                for (const layer of LAYERS) {
                    await processTile(layer, z, x, y);
                }
            }
        }
    }
}

async function processTile(layer, z, x, y) {
    try {
        let url = "";
        if (layer === 'google-street') url = `https://mt1.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`;
        else if (layer === 'satellite') url = `https://mt1.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}`;
        else if (layer === 'hybrid-labels') url = `https://mt1.google.com/vt/lyrs=h&x=${x}&y=${y}&z=${z}`;

        const res = await axios({ url, method: 'GET', responseType: 'arraybuffer', timeout: 5000 });
        const data = res.data;

        // 💎 THE 150GB SECRET: Image Hashing (Deduplication)
        // If 1 million tiles are just "Blue Sea" or "Green Forest", we store ONE blob.
        const hash = crypto.createHash('sha256').update(data).digest('hex');

        db.run("INSERT OR IGNORE INTO imagery_blobs (hash, data) VALUES (?, ?)", [hash, data]);
        db.run("INSERT OR REPLACE INTO map_index (z, x, y, layer, hash) VALUES (?, ?, ?, ?, ?)", [z, x, y, layer, hash]);

    } catch (e) {
        // Log errors but continue
    }
}

function latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lng + 180) / 360 * n);
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    return { x, y };
}

// 🚀 Start with Country-wide base (e.g. 0-14)
// High-Res 15-21 will take time and proxies
harvestArea(0, 14);
