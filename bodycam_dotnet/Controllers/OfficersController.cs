using BodycamApi.Data;
using BodycamApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BodycamApi.Controllers;

[ApiController]
[Route("api/officers")]
public class OfficersController : ControllerBase
{
    private readonly BodycamDbContext _db;
    public OfficersController(BodycamDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await _db.Officers
            .OrderBy(o => o.Id)
            .Select(o => new {
                o.Id, o.Name, o.Badge, o.Area, o.Enrolled,
                recordings = o.Recordings.Count,
            })
            .ToListAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var o = await _db.Officers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        return o is null ? NotFound() : Ok(o);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Officer officer)
    {
        if (string.IsNullOrWhiteSpace(officer.Id))
            return BadRequest(new { error = "Id is required" });
        if (await _db.Officers.AnyAsync(o => o.Id == officer.Id))
            return Conflict(new { error = $"Officer {officer.Id} already exists" });

        officer.CreatedAt = DateTime.UtcNow;
        officer.UpdatedAt = DateTime.UtcNow;
        _db.Officers.Add(officer);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = officer.Id }, officer);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] Officer patch)
    {
        var existing = await _db.Officers.FirstOrDefaultAsync(o => o.Id == id);
        if (existing is null) return NotFound();
        existing.Name     = patch.Name;
        existing.Badge    = patch.Badge;
        existing.Area     = patch.Area;
        existing.Enrolled = patch.Enrolled;
        existing.VoiceprintPath = patch.VoiceprintPath;
        existing.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(existing);
    }
}
