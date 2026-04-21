const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 5000;
const DB_PATH = path.join(__dirname, 'tiles.db');

app.use(cors());
app.use(express.json());

let db;
function initDB() {
    db = new sqlite3.Database(DB_PATH);
    db.serialize(() => {
        db.run("CREATE TABLE IF NOT EXISTS downloads (city TEXT PRIMARY KEY, status TEXT, size_mb REAL, completed_tiles INTEGER, total_tiles INTEGER, bbox TEXT)");
        db.run("CREATE TABLE IF NOT EXISTS tiles (layer TEXT, z INTEGER, x INTEGER, y INTEGER, data BLOB, PRIMARY KEY(layer, z, x, y))");
        db.run("ALTER TABLE downloads ADD COLUMN total_tiles INTEGER DEFAULT 0", () => {});
        db.run("ALTER TABLE downloads ADD COLUMN bbox TEXT", () => {});
        // 🔥 OMEGA TURBO-KERNEL (v97.0): Stability + Raw Power
        db.run("PRAGMA journal_mode = WAL");
        db.run("PRAGMA synchronous = OFF"); 
        db.run("PRAGMA cache_size = 10000");
    });
}
initDB();

let downloadQueue = { total: 0, completed: 0, bytes: 0, active: false, paused: false, city: '', maxZoom: 21, totalMb: 0 };

async function getTileWithFallback(layer, z, x, y) {
    return new Promise((resolve) => {
        db.get(`SELECT data FROM tiles WHERE layer=? AND z=? AND x=? AND y=?`, [layer, z, x, y], async (err, row) => {
            if (row) {
                downloadQueue.bytes += row.data.length;
                return resolve(row.data);
            }
            const urls = {
                'google-street': `https://mt1.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`,
                'satellite': `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`,
                'arcgis-street': `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
                'arcgis-satellite': `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
            };
            try {
                const response = await axios.get(urls[layer] || urls['google-street'], { responseType: 'arraybuffer', timeout: 8000 });
                const buffer = Buffer.from(response.data, 'binary');
                db.run(`INSERT OR IGNORE INTO tiles (layer, z, x, y, data) VALUES (?,?,?,?,?)`, [layer, z, x, y, buffer]);
                downloadQueue.bytes += buffer.length;
                resolve(buffer);
            } catch (e) { resolve(null); }
        });
    });
}

function latLngToTile(lat, lng, zoom) {
    const sinLat = Math.sin(lat * Math.PI / 180);
    const zBase = Math.pow(2, zoom);
    return { x: Math.floor((lng + 180) / 360 * zBase), y: Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * zBase) };
}

app.get('/tiles/:layer/:z/:x/:y.png', async (req, res) => {
    const { layer, z, x, y } = req.params;
    const tile = await getTileWithFallback(layer, parseInt(z), parseInt(x), parseInt(y));
    if (tile) { res.set('Content-Type', 'image/png'); res.send(tile); } else res.status(404).send('Not found');
});

app.post('/start-download', (req, res) => {
    const { city, bbox } = req.body;
    const pakBbox = [60.8, 23.6, 77.9, 37.1]; 
    const iranBbox = [44.0, 24.0, 63.5, 40.0];
    const afghanBbox = [60.0, 29.3, 74.9, 38.5];

    let activeBbox = bbox;
    if (city === 'All Pakistan') activeBbox = pakBbox;
    else if (city === 'Full Iran') activeBbox = iranBbox;
    else if (city === 'Full Afghanistan') activeBbox = afghanBbox;

    const maxZ = 21; 
    let totalTotal = 0;
    const layers = ['google-street', 'satellite', 'arcgis-street', 'arcgis-satellite'];
    
    // 📐 PRE-CALCULATE ACCURATE TARGETS
    for (let z = 0; z <= maxZ; z++) {
        const nw = latLngToTile(Math.max(activeBbox[1], activeBbox[3]), Math.min(activeBbox[0], activeBbox[2]), z);
        const se = latLngToTile(Math.min(activeBbox[1], activeBbox[3]), Math.max(activeBbox[0], activeBbox[2]), z);
        totalTotal += (Math.abs(se.x - nw.x) + 1) * (Math.abs(se.y - nw.y) + 1);
    }
    
    const finalTotal = totalTotal * layers.length;
    // 🧠 REALISTIC ESTIMATOR (v62.2): WebP avg ~6KB per tile
    let finalTotalMb = (finalTotal * 0.006); 
    if (city === 'All Pakistan') finalTotalMb = 250000; 
    else if (city === 'Full Iran') finalTotalMb = 550000;
    else if (city === 'Full Afghanistan') finalTotalMb = 220000;

    downloadQueue = { 
        total: finalTotal, completed: 0, bytes: 0, active: true, paused: false, city, 
        totalMb: parseFloat(finalTotalMb), bbox: activeBbox 
    };
    
    // 🚩 SAVE METRICS TO DB (v98.0 Fix: Added total_tiles)
    db.run("INSERT OR REPLACE INTO downloads (city, status, size_mb, completed_tiles, total_tiles, bbox) VALUES (?,?,?,?,?,?)", 
        [city, 'Downloading', 0, 0, finalTotal, JSON.stringify(activeBbox)]);
    res.json({ status: "started", total: finalTotal });

    (async () => {
        const activePromises = new Set();
        const CONCURRENCY = 100; 
        let yieldCounter = 0;

        try {
            for (let z = 0; z <= maxZ; z++) {
                if (!downloadQueue.active) break;
                const nw_c = latLngToTile(Math.max(activeBbox[1], activeBbox[3]), Math.min(activeBbox[0], activeBbox[2]), z);
                const se_c = latLngToTile(Math.min(activeBbox[1], activeBbox[3]), Math.max(activeBbox[0], activeBbox[2]), z);
                
                for (let x = Math.min(nw_c.x, se_c.x); x <= Math.max(nw_c.x, se_c.x); x++) {
                    for (let y = Math.min(nw_c.y, se_c.y); y <= Math.max(nw_c.y, se_c.y); y++) {
                        if (!downloadQueue.active) break;
                        
                        // ⚙️ OMEGA STABILITY KERNEL (v110.0): Prevent Event Loop Blocking
                        yieldCounter++;
                        if (yieldCounter >= 500) {
                            yieldCounter = 0;
                            await new Promise(r => setImmediate(r)); // 🧠 Crucial: Let Node.js "Breathe"
                        }

                        for (const layer of layers) {
                            const p = (async () => {
                                try {
                                    await getTileWithFallback(layer, z, x, y);
                                    downloadQueue.completed++;
                                } catch (err) {} 
                            })();
                            activePromises.add(p);
                            p.finally(() => activePromises.delete(p));
                            
                            if (activePromises.size >= CONCURRENCY) await Promise.race(activePromises);
                            if (downloadQueue.completed % 500 === 0) {
                                db.run("UPDATE downloads SET size_mb=?, completed_tiles=? WHERE city=?", [(downloadQueue.bytes/(1024*1024)).toFixed(2), downloadQueue.completed, city]);
                            }
                        }
                    }
                    if (!downloadQueue.active) break;
                }
            }
            if (activePromises.size > 0) await Promise.all(activePromises);
        } catch (e) { 
            console.error("[OMEGA] Heavy-Duty Harvester Error:", e);
            db.run("UPDATE downloads SET status='Error' WHERE city=?", [city]);
        }

        downloadQueue.active = false;
        db.run("UPDATE downloads SET status='Completed', size_mb=?, completed_tiles=? WHERE city=?", 
            [(downloadQueue.bytes/(1024*1024)).toFixed(2), downloadQueue.completed, city]);
    })();
});

app.get('/download-status', (req, res) => {
    const currentMbNum = downloadQueue.bytes / (1024*1024);
    const currentMb = currentMbNum.toFixed(2);
    let totalTiles = downloadQueue.total;
    let completedTiles = downloadQueue.completed;
    if (completedTiles > totalTiles) totalTiles = completedTiles;

    // 📊 OMEGA REGIONAL PARTITIONS (v101.0) - Mandatory Budgets
    const budgets = {
        'Punjab': 85000, 'Sindh': 65000, 'KPK': 45000, 'Balochistan': 35000, 
        'Gilgit-Baltistan': 12000, 'AJK': 8000,
        'All Pakistan': 256000,
        'Full Iran': 563200,
        'Full Afghanistan': 225280
    };

    let estimatedTotalMbNum = totalTiles * 0.006; 
    
    if (downloadQueue.city) {
        for (const [name, budget] of Object.entries(budgets)) {
            if (downloadQueue.city.includes(name)) {
                estimatedTotalMbNum = budget;
                break;
            }
        }
    }
    
    if (currentMbNum > estimatedTotalMbNum) estimatedTotalMbNum = currentMbNum; 
    res.json({ ...downloadQueue, mb: currentMb, totalMb: estimatedTotalMbNum.toFixed(2), totalTiles, completedTiles });
});

// 🛡️ OMEGA REGIONAL GEOFENCE (v106.2 Refresh)
function isInsideAllowedZone(bbox) {
    // Covers Iran, Afghanistan, and Pakistan: Lon [44, 80], Lat [23, 40]
    return !(bbox[0] < 44 || bbox[2] > 80 || bbox[1] < 23 || bbox[3] > 40);
}

app.get('/api/search', async (req, res) => {
    const { q, countrycodes, limit } = req.query;
    if (!q) return res.json([]);
    
    try {
        const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
            params: {
                q,
                countrycodes: countrycodes || 'pk',
                format: 'json',
                addressdetails: 1,
                limit: limit || 5
            },
            headers: {
                'User-Agent': 'OMEGA-GIS-Engine/1.0'
            }
        });
        res.json(response.data);
    } catch (e) {
        console.error("[OMEGA] Search Error:", e.message);
        res.status(500).json([]);
    }
});

app.get('/all-downloads', (req, res) => { db.all("SELECT * FROM downloads", [], (err, rows) => res.json(rows)); });
app.post('/delete-download', (req, res) => { db.run("DELETE FROM downloads WHERE city=?", [req.body.city], () => res.json({ success: true })); });

// ☢️ NUCLEAR RESET: PERMANENT DISK PURGE (v106.0)
app.post('/delete-all-data', (req, res) => {
    console.log("[OMEGA] ☢️ NUCLEAR RESET INITIATED...");
    
    // 1. Clear physical tiles folder
    const tilesDir = path.join(__dirname, 'wwwroot', 'tiles');
    if (fs.existsSync(tilesDir)) {
        try { fs.rmSync(tilesDir, { recursive: true, force: true }); fs.mkdirSync(tilesDir, { recursive: true }); } catch (e) {}
    }

    // 2. Kill DB connection and Delete tiles.db for 100% space recovery
    db.close((err) => {
        const files = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
        files.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
        
        console.log("[OMEGA] ☢️ Disk files purged. Re-initializing empty database...");
        initDB(); // Restart fresh
        res.json({ success: true });
    });
});

// 🚩 GLOBAL PERSISTENCE HELPER (v84.0)
function updateInventory(city, deltaMb, deltaTiles, status = 'Completed', bbox = null) {
    db.get("SELECT * FROM downloads WHERE city=?", [city], (err, row) => {
        let currentBbox = bbox;
        if (row && row.bbox && bbox) {
            const old = JSON.parse(row.bbox);
            currentBbox = [Math.min(old[0], bbox[0]), Math.min(old[1], bbox[1]), Math.max(old[2], bbox[2]), Math.max(old[3], bbox[3])];
        } else if (row) {
            currentBbox = JSON.parse(row.bbox || 'null');
        }
        
        let targetTiles = (row ? row.total_tiles : 0);
        if (city === 'Auto-Discovered Data' && currentBbox) {
            let scope = 0;
            for (let z = 15; z <= 21; z++) {
                const nw = latLngToTile(currentBbox[3], currentBbox[0], z);
                const se = latLngToTile(currentBbox[1], currentBbox[2], z);
                scope += (Math.abs(se.x - nw.x) + 1) * (Math.abs(se.y - nw.y) + 1);
            }
            targetTiles = scope * 2;
        }

        const size = (row ? row.size_mb : 0) + deltaMb;
        const tiles = (row ? row.completed_tiles : 0) + deltaTiles;
        
        db.run("INSERT OR REPLACE INTO downloads (city, status, size_mb, completed_tiles, total_tiles, bbox) VALUES (?,?,?,?,?,?)",
            [city, status, size, tiles, targetTiles, JSON.stringify(currentBbox)]);
    });
}

const discoveryQueue = [];
let isDiscovering = false;
let autoCity = 'Auto-Discovered Data';
let currentScopeBbox = null;
let inMemoryDiscovered = { mb: 0, tiles: 0 };

async function flushDiscoveredStats() {
    if (inMemoryDiscovered.tiles === 0) return;
    const mb = inMemoryDiscovered.mb;
    const tiles = inMemoryDiscovered.tiles;
    inMemoryDiscovered = { mb: 0, tiles: 0 };
    return new Promise(r => {
        db.run("UPDATE downloads SET size_mb = size_mb + ?, completed_tiles = completed_tiles + ? WHERE city=?", [mb, tiles, autoCity], r);
    });
}

let autoHarvestingStatus = { active: false, completed: 0, total: 0, mb: 0 };

let autoMissionActive = false; // true = planning mode (no download), false = harvest mode

async function startHarvesting() {
    if (isDiscovering) { console.log('[HARVEST] Already running, skip.'); return; }
    isDiscovering = true;
    const layers = ['google-street', 'satellite', 'arcgis-street', 'arcgis-satellite'];
    
    try {
        const row = await new Promise(resolve => 
            db.get("SELECT bbox, total_tiles, size_mb, completed_tiles FROM downloads WHERE city=?", 
                [autoCity], (err, r) => resolve(r))
        );
        
        if (!row || !row.bbox) { 
            console.log('[HARVEST] ❌ No scope found in DB. Plan first (turn ON and move map).');
            isDiscovering = false; 
            return; 
        }
        
        const scopeBbox = JSON.parse(row.bbox);
        autoHarvestingStatus = { 
            active: true, 
            completed: row.completed_tiles || 0, 
            total: row.total_tiles || 0, 
            mb: parseFloat(row.size_mb) || 0 
        };
        
        const zoomTiers = [[15,16,17,18], [19,20,21]];
        for (const tier of zoomTiers) {
            for (const z of tier) {
                if (autoMissionActive) break;
                
                const nw = latLngToTile(Math.max(scopeBbox[1], scopeBbox[3]), Math.min(scopeBbox[0], scopeBbox[2]), z);
                const se = latLngToTile(Math.min(scopeBbox[1], scopeBbox[3]), Math.max(scopeBbox[0], scopeBbox[2]), z);
                
                const minX = Math.min(nw.x, se.x), maxX = Math.max(nw.x, se.x);
                const minY = Math.min(nw.y, se.y), maxY = Math.max(nw.y, se.y);
                
                let activePromises = new Set();
                const CONCURRENCY = 100; // Increased stability
                
                for (let x = minX; x <= maxX; x++) {
                    for (let y = minY; y <= maxY; y++) {
                        if (autoMissionActive) break;
                        for (const layer of layers) {
                            const p = (async () => {
                                try {
                                    // Use unified fallback logic to handle all layers
                                    await getTileWithFallback(layer, z, x, y);
                                    autoHarvestingStatus.completed += 1;
                                    
                                    if (autoHarvestingStatus.completed % 250 === 0) {
                                        autoHarvestingStatus.mb = downloadQueue.bytes / (1024*1024); // Update from core counter
                                        db.run("UPDATE downloads SET size_mb=?, completed_tiles=? WHERE city=?", 
                                            [autoHarvestingStatus.mb.toFixed(2), autoHarvestingStatus.completed, autoCity]);
                                    }
                                } catch (tileErr) {}
                            })();
                            activePromises.add(p);
                            p.finally(() => activePromises.delete(p));
                            if (activePromises.size >= CONCURRENCY) await Promise.race(activePromises);
                        }
                    }
                    if (autoMissionActive) break;
                }
                if (activePromises.size > 0) await Promise.all(activePromises);
            }
            if (autoMissionActive) break;
        }
        
        if (!autoMissionActive) {
            db.run("UPDATE downloads SET status='Completed' WHERE city=?", [autoCity]);
            console.log(`[HARVEST] 🏁 COMPLETE! ${autoHarvestingStatus.completed} tiles | ${autoHarvestingStatus.mb.toFixed(1)} MB`);
        } else {
            console.log(`[HARVEST] 🛑 PAUSED BY USER! Saved ${autoHarvestingStatus.completed} tiles`);
        }
    } catch (e) { 
        console.error('[HARVEST] ❌ Fatal Error:', e); 
    } finally {
        isDiscovering = false; 
        autoHarvestingStatus.active = false; 
    }
}

app.get('/download-status', (req, res) => {
    // 🛡️ UNIVERSAL STATUS REPORTER (v105.0)
    if (downloadQueue.active) {
        const mb = (downloadQueue.bytes / (1024*1024)).toFixed(2);
        return res.json({ ...downloadQueue, mb, totalMb: (downloadQueue.total * 0.006).toFixed(2), totalTiles: downloadQueue.total, completedTiles: downloadQueue.completed });
    }
    
    if (autoHarvestingStatus.active) {
        return res.json({ 
            active: true, 
            city: '🛰️ Auto-Discovered Data', 
            completed: autoHarvestingStatus.completed, 
            total: autoHarvestingStatus.total, 
            mb: autoHarvestingStatus.mb.toFixed(2), 
            totalMb: (autoHarvestingStatus.total * 0.006).toFixed(2),
            completedTiles: autoHarvestingStatus.completed,
            totalTiles: autoHarvestingStatus.total
        });
    }

    res.json({ active: false });
});

app.post('/auto-discover', (req, res) => {
    const isEnabled = req.body.enabled;
    autoMissionActive = isEnabled; // If enabled, we are PLANNING (not harvesting)
    const bbox = req.body.bbox;
    if (!isInsideAllowedZone(bbox)) return res.json({ success: true, ignored: true });

    db.get("SELECT bbox FROM downloads WHERE city=?", [autoCity], (err, row) => {
        let finalBbox = bbox;
        if (row && row.bbox) {
            const old = JSON.parse(row.bbox);
            finalBbox = [Math.min(old[0], bbox[0]), Math.min(old[1], bbox[1]), Math.max(old[2], bbox[2]), Math.max(old[3], bbox[3])];
        }

        let scope = 0;
        for (let z = 15; z <= 21; z++) {
            const nw = latLngToTile(finalBbox[3], finalBbox[0], z);
            const se = latLngToTile(finalBbox[1], finalBbox[2], z);
            scope += (Math.abs(se.x - nw.x) + 1) * (Math.abs(se.y - nw.y) + 1);
        }
        const totalLayers = ['google-street', 'satellite', 'arcgis-street', 'arcgis-satellite'].length;
        const totalScope = scope * totalLayers;
        const status = isEnabled ? '📍 Planning Mission...' : '📡 Harvesting Scope...';

        db.run("INSERT OR REPLACE INTO downloads (city, status, size_mb, completed_tiles, total_tiles, bbox) VALUES (?,?,?,?,?,?)",
            [autoCity, status, (row && row.size_mb != null ? row.size_mb : 0), (row && row.completed_tiles != null ? row.completed_tiles : 0), totalScope, JSON.stringify(finalBbox)], () => {
                if (!isEnabled) startHarvesting();
                res.json({ success: true });
            });
    });
});

app.post('/stop-download', (req, res) => { 
    downloadQueue.active = false; 
    autoMissionActive = true;     // PAUSE AUTO-HARVEST
    isDiscovering = false;        // Release auto-discover lock
    autoHarvestingStatus.active = false; // Turn off floating UI
    db.run("UPDATE downloads SET status='Paused' WHERE status LIKE '%Harvesting%' OR status LIKE '%Downloading%'");
    res.json({ success: true }); 
});

// 🛡️ OMEGA REGIONAL GEOFENCE (v106.2 Refresh)
function isInsideAllowedZone(bbox) {
    // Covers Iran, Afghanistan, and Pakistan: Lon [44, 80], Lat [23, 40]
    return !(bbox[0] < 44 || bbox[2] > 80 || bbox[1] < 23 || bbox[3] > 40);
}

app.listen(PORT, '0.0.0.0', () => { console.log(`\n💎 OMEGA 250GB PAKISTAN Z21 LIVE\n📡 Port: ${PORT} | Mode: Full-Scale Pakistan Sync\n`); });
