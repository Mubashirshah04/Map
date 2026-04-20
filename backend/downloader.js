const https = require('https');
const fs = require('fs');
const path = require('path');

const timesSquare = { lat: 40.7580, lon: -73.9855 };
const zooms = [15, 16, 17, 18];
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';

function latLonToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    return { x, y };
}

async function downloadTile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, { headers: { 'User-Agent': userAgent } }, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            } else {
                file.close();
                fs.unlink(dest, () => {}); // Delete the empty file
                reject(`Server responded with ${response.statusCode}`);
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err.message);
        });
    });
}

(async () => {
    console.log("🚀 Starting download of REAL tiles for Times Square area...");
    for (const z of zooms) {
        const { x: baseX, y: baseY } = latLonToTile(timesSquare.lat, timesSquare.lon, z);
        
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = baseX + dx;
                const y = baseY + dy;

                const streetDir = path.join(__dirname, 'wwwroot', 'tiles', 'street', z.toString(), x.toString());
                const satDir = path.join(__dirname, 'wwwroot', 'tiles', 'satellite', z.toString(), x.toString());
                
                fs.mkdirSync(streetDir, { recursive: true });
                fs.mkdirSync(satDir, { recursive: true });

                const osmUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
                const arcgisUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
                
                try {
                    await downloadTile(osmUrl, path.join(streetDir, `${y}.png`));
                    console.log(`✅ Street tile ${z}/${x}/${y} downloaded.`);
                } catch (e) { console.error(`❌ Street tile ${z}/${x}/${y} failed: ${e}`); }

                try {
                    await downloadTile(arcgisUrl, path.join(satDir, `${y}.png`));
                    console.log(`✅ Satellite tile ${z}/${x}/${y} downloaded.`);
                } catch (e) { console.error(`❌ Satellite tile ${z}/${x}/${y} failed: ${e}`); }
            }
        }
    }
    console.log("🏁 Tile download attempt complete.");
})();
