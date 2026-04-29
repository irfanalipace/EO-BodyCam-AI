using BodycamApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BodycamApi.Controllers;

/// <summary>
/// Read endpoints the portal uses to surface CRITICAL recordings.
/// Optimized for dashboard: fast, paginated, with the fields a triage UI needs.
/// </summary>
[ApiController]
[Route("api/critical")]
public class CriticalIncidentsController : ControllerBase
{
    private readonly BodycamDbContext _db;
    public CriticalIncidentsController(BodycamDbContext db) => _db = db;

    /// <summary>
    /// All CRITICAL recordings, newest first. Supports filtering by media_type
    /// ("video" / "audio") and date range (since/until).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? mediaType,
        [FromQuery] DateTime? since,
        [FromQuery] DateTime? until,
        [FromQuery] string? officerId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.Recordings
            .Where(r => r.AnalysisResult != null && r.AnalysisResult.Severity == "CRITICAL")
            .Include(r => r.AnalysisResult)
            .Include(r => r.Officer)
            .OrderByDescending(r => r.UploadedAt)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(mediaType))
            q = q.Where(r => r.MediaType == mediaType);

        if (!string.IsNullOrWhiteSpace(officerId))
            q = q.Where(r => r.OfficerId == officerId);

        if (since.HasValue)
            q = q.Where(r => r.UploadedAt >= since.Value);

        if (until.HasValue)
            q = q.Where(r => r.UploadedAt <= until.Value);

        var total = await q.CountAsync();
        var items = await q
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                recordingId   = r.Id,
                officerId     = r.OfficerId,
                officerName   = r.Officer != null ? r.Officer.Name : r.OfficerId,
                filename      = r.Filename,
                mediaType     = r.MediaType,
                uploadedAt    = r.UploadedAt,
                durationSec   = r.DurationSeconds,
                stationId     = r.StationId,
                score         = r.AnalysisResult!.TotalScore,
                severity      = r.AnalysisResult.Severity,
                toneLabel     = r.AnalysisResult.ToneLabel,
                dominantEmotion = r.AnalysisResult.DominantEmotion,
                criticalCount = r.AnalysisResult.CriticalCount,
                highCount     = r.AnalysisResult.HighCount,
                mediumCount   = r.AnalysisResult.MediumCount,
                violations    = r.Violations.Count,
                aiAssessment  = r.AnalysisResult.AiAssessment,
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    /// <summary>Counts of CRITICAL incidents per day for the last N days (default 30).</summary>
    [HttpGet("trend")]
    public async Task<IActionResult> Trend([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 1, 365);
        var since = DateTime.UtcNow.Date.AddDays(-days);

        var rows = await _db.Recordings
            .Where(r => r.AnalysisResult != null
                     && r.AnalysisResult.Severity == "CRITICAL"
                     && r.UploadedAt >= since)
            .GroupBy(r => new { Y = r.UploadedAt.Year, M = r.UploadedAt.Month, D = r.UploadedAt.Day })
            .Select(g => new
            {
                date = $"{g.Key.Y:D4}-{g.Key.M:D2}-{g.Key.D:D2}",
                count = g.Count(),
                avgScore = g.Average(r => (double)r.AnalysisResult!.TotalScore),
            })
            .OrderBy(x => x.date)
            .ToListAsync();

        return Ok(rows);
    }

    /// <summary>Counts of CRITICAL incidents per officer (top offenders dashboard).</summary>
    [HttpGet("by-officer")]
    public async Task<IActionResult> ByOfficer([FromQuery] int limit = 20)
    {
        limit = Math.Clamp(limit, 1, 200);
        var rows = await _db.Recordings
            .Where(r => r.AnalysisResult != null && r.AnalysisResult.Severity == "CRITICAL")
            .GroupBy(r => r.OfficerId)
            .Select(g => new
            {
                officerId    = g.Key,
                criticalCount = g.Count(),
                avgScore      = g.Average(r => (double)r.AnalysisResult!.TotalScore),
                lastIncident  = g.Max(r => r.UploadedAt),
            })
            .OrderByDescending(x => x.criticalCount)
            .Take(limit)
            .ToListAsync();

        return Ok(rows);
    }
}
