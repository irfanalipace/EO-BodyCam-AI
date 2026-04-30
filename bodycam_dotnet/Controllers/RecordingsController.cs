using BodycamApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BodycamApi.Controllers;

/// <summary>
/// Read endpoints for the dashboard — list / detail / officer-scoped queries.
/// </summary>
[ApiController]
[Route("api/recordings")]
public class RecordingsController : ControllerBase
{
    private readonly BodycamDbContext _db;
    public RecordingsController(BodycamDbContext db) => _db = db;

    /// <summary>List recent recordings, optionally filtered by officer or severity.</summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? officerId,
        [FromQuery] string? severity,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.Recordings
            .Include(r => r.AnalysisResult)
            .OrderByDescending(r => r.UploadedAt)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(officerId))
            q = q.Where(r => r.OfficerId == officerId);

        if (!string.IsNullOrWhiteSpace(severity))
            q = q.Where(r => r.AnalysisResult != null && r.AnalysisResult.Severity == severity);

        var total = await q.CountAsync();
        var items = await q
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                r.Id,
                r.OfficerId,
                r.Filename,
                r.MediaType,
                r.DurationSeconds,
                r.UploadedAt,
                Score = r.AnalysisResult == null ? 0 : r.AnalysisResult.TotalScore,
                Severity = r.AnalysisResult == null ? "NORMAL" : r.AnalysisResult.Severity,
                ToneLabel = r.AnalysisResult == null ? "NORMAL" : r.AnalysisResult.ToneLabel,
                ViolationCount = r.Violations.Count,
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    /// <summary>Full detail (analysis + violations) for one recording.</summary>
    [HttpGet("{id:long}")]
    public async Task<IActionResult> Detail(long id)
    {
        var rec = await _db.Recordings
            .Include(r => r.AnalysisResult)
            .Include(r => r.Violations.OrderByDescending(v => v.Score))
            .Include(r => r.Officer)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id);
        return rec is null ? NotFound() : Ok(rec);
    }

    /// <summary>Aggregate stats for the main dashboard.</summary>
    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        var since = DateTime.UtcNow.AddDays(-30);

        var totalRecordings = await _db.Recordings.CountAsync();
        var critical = await _db.AnalysisResults.CountAsync(a => a.Severity == "CRITICAL");
        var warning  = await _db.AnalysisResults.CountAsync(a => a.Severity == "WARNING");
        var last30   = await _db.Recordings.CountAsync(r => r.UploadedAt >= since);

        var topOfficers = await _db.Recordings
            .GroupBy(r => r.OfficerId)
            .Select(g => new {
                officerId = g.Key,
                recordings = g.Count(),
                criticalCount = g.Count(r => r.AnalysisResult != null && r.AnalysisResult.Severity == "CRITICAL"),
            })
            .OrderByDescending(x => x.criticalCount)
            .Take(10)
            .ToListAsync();

        return Ok(new {
            totalRecordings,
            critical,
            warning,
            normal = totalRecordings - critical - warning,
            last30Days = last30,
            topOfficersByCritical = topOfficers,
        });
    }
}
