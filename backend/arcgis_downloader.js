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
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return resolve(); // Skip existing real tiles
        const file = fs.createWriteStream(dest);
        https.get(url, { headers: { 'User-Agent': userAgent } }, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            } else {
                file.close();
                fs.unlink(dest, () => {});
                reject(`Server responded with ${response.statusCode}`);
            }
        }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err.message); });
    });
}

(async () => {
    console.log("🚀 OMEGA RETINA-HD: Switching to Google High-DPI Scale=2 Architecture...");
    for (const z of zooms) {
        const { x: baseX, y: baseY } = latLonToTile(timesSquare.lat, timesSquare.lon, z);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = baseX + dx;
                const y = baseY + dy;
                const streetDir = path.join(__dirname, 'wwwroot', 'tiles', 'google-street', z.toString(), x.toString());
                fs.mkdirSync(streetDir, { recursive: true });
                
                // 💎 RETINA SCALE 2.0: Crystal Clear Labels & Roads
                const googleRetinaUrl = `https://mt1.google.com/vt/lyrs=m&hl=en&x=${x}&y=${y}&z=${z}&scale=2`;
                
                try {
                    await downloadTile(googleRetinaUrl, path.join(streetDir, `${y}.png`));
                    console.log(`✅ OMEGA Retina ${z}/${x}/${y} ok.`);
                } catch (e) { console.error(`❌ Failed: ${e}`); }
            }
        }
    }
    console.log("🏁 Done.");
})();
