using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using Microsoft.Data.Sqlite;

namespace PakistanMaps.Controllers
{
    [ApiController]
    [Route("tiles")]
    public class TileController : ControllerBase
    {
        private readonly string _connectionString = "Data Source=wwwroot/data/pakistan_omega.mbtiles";

        [HttpGet("{layer}/{z}/{x}/{y}")]
        public async Task<IActionResult> GetTile(string layer, int z, int x, int y)
        {
            try
            {
                using var connection = new SqliteConnection(_connectionString);
                await connection.OpenAsync();

                // 🚀 The OMEGA Query: Get tile data via Hash-Mapping (Deduplication)
                var query = @"
                    SELECT b.data 
                    FROM map_index m 
                    JOIN imagery_blobs b ON m.hash = b.hash 
                    WHERE m.z = @z AND m.x = @x AND m.y = @y AND m.layer = @layer";

                using var command = new SqliteCommand(query, connection);
                command.Parameters.AddWithValue("@z", z);
                command.Parameters.AddWithValue("@x", x);
                command.Parameters.AddWithValue("@y", y);
                command.Parameters.AddWithValue("@layer", layer);

                using var reader = await command.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    var data = (byte[])reader["data"];
                    // Check if it's WebP or PNG (WebP preferred for 150GB target)
                    return File(data, "image/webp");
                }

                // 🌉 Upscale Fallback: If Zoom 21 is missing, fetch Zoom 20 and stretch
                return await GetUpscaledFallback(layer, z, x, y);
            }
            catch (Exception ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        private async Task<IActionResult> GetUpscaledFallback(string layer, int z, int x, int y)
        {
            // Logic to grab parent tile (Z-1) and crop it
            // For now, return a placeholder or 404 until we integrate drawing libs
            return NotFound("Tile not discovered yet.");
        }
    }
}
