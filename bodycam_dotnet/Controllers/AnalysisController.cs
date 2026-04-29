using BodycamApi.Data;
using BodycamApi.Models;
using BodycamApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BodycamApi.Controllers;

/// <summary>
/// Bridges the React frontend → .NET → Python Flask AI backend → MSSQL.
/// VIDEO PIPELINE: when a video file is uploaded, this controller extracts the audio
/// track via ffmpeg and forwards ONLY the audio to Python. Python's existing audio
/// pipeline (transcription / tone / keywords / emotions / narrative / scoring) runs
/// unchanged. The video file itself is never sent to Python in this mode.
/// </summary>
[ApiController]
[Route("api/analysis")]
public class AnalysisController : ControllerBase
{
    private readonly PythonAnalysisService _python;
    private readonly VideoAudioExtractor _extractor;
    private readonly BodycamDbContext _db;
    private readonly ILogger<AnalysisController> _log;

    public AnalysisController(
        PythonAnalysisService python,
        VideoAudioExtractor extractor,
        BodycamDbContext db,
        ILogger<AnalysisController> log)
    {
        _python = python;
        _extractor = extractor;
        _db = db;
        _log = log;
    }

    /// <summary>
    /// Upload a recording. Accepts the same multipart form the Python backend already accepts:
    ///   field "audio" = file (audio or video)
    ///   field "officer_id" = string (e.g. "EO_001")
    ///   field "station_id" = optional string
    ///
    /// Behaviour:
    ///   • Audio file → forwarded directly to Python.
    ///   • Video file → ffmpeg extracts the audio track to 16 kHz mono WAV, then
    ///                  ONLY the audio is forwarded to Python (Python sees no video).
    ///                  Original filename is preserved in the DB so the portal still
    ///                  shows it as a video recording.
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(2L * 1024 * 1024 * 1024)]   // 2 GB
    public async Task<IActionResult> Upload(
        IFormFile audio,
        [FromForm(Name = "officer_id")] string? officerId,
        [FromForm(Name = "station_id")] string? stationId,
        CancellationToken ct)
    {
        if (audio is null || audio.Length == 0)
            return BadRequest(new { error = "audio file is required" });

        officerId ??= "EO_001";

        // Make sure the officer exists in our DB (insert minimal row if not).
        await EnsureOfficerExistsAsync(officerId, ct);

        // ── Step 1: spool upload to a temp file so we can probe / extract from it ──
        var originalFilename = audio.FileName;
        var originalSize = audio.Length;
        var inputTempPath = Path.Combine(Path.GetTempPath(),
            $"bodycam_upload_{Guid.NewGuid():N}{Path.GetExtension(originalFilename)}");

        try
        {
            await using (var fs = System.IO.File.Create(inputTempPath))
                await audio.CopyToAsync(fs, ct);

            // ── Step 2: if it's a video, extract audio first ──
            string filenameForPython = originalFilename;
            string fileToSend = inputTempPath;
            string? extractedWav = null;
            bool wasVideo = VideoAudioExtractor.IsVideo(originalFilename);

            if (wasVideo)
            {
                _log.LogInformation("Video upload detected ({File}) — extracting audio with ffmpeg...", originalFilename);
                extractedWav = await _extractor.ExtractToWavAsync(inputTempPath, ct);
                if (extractedWav is null)
                    return StatusCode(500, new { error = "Failed to extract audio from video — check ffmpeg install and video format" });

                fileToSend = extractedWav;
                // Send to Python with a .wav extension so its loader treats it as audio.
                filenameForPython = Path.ChangeExtension(originalFilename, ".wav");
            }

            // ── Step 3: forward audio (only) to Python ──
            await using var pythonStream = System.IO.File.OpenRead(fileToSend);
            using var pyJson = await _python.AnalyzeUploadAsync(pythonStream, filenameForPython, officerId, ct);

            if (pyJson is null)
                return StatusCode(502, new { error = "Python AI backend unavailable or timed out" });

            // Cleanup extracted WAV — we have the analysis result now.
            if (extractedWav is not null) TryDelete(extractedWav);

            // ── Step 4: map → entities → save ──
            // Use the ORIGINAL filename and size in the DB so the portal still
            // records it as the video the user uploaded, not the extracted WAV.
            var (rec, analysis, violations) = AnalysisMapper.Map(
                pyJson, originalFilename, originalSize, officerId, stationId);

            // Force media_type to "video" if the original was a video, even though
            // Python only saw audio. This lets the portal filter video-derived recordings.
            if (wasVideo) rec.MediaType = "video";

            rec.AnalysisResult = analysis;
            rec.Violations = violations;

            _db.Recordings.Add(rec);
            await _db.SaveChangesAsync(ct);

            _log.LogInformation(
                "Stored recording id={Id} type={Type} score={Score} severity={Sev} violations={N}",
                rec.Id, rec.MediaType, analysis.TotalScore, analysis.Severity, violations.Count);

            return Ok(new
            {
                recording_id = rec.Id,
                media_type = rec.MediaType,
                was_video = wasVideo,
                stored_at = rec.UploadedAt,
                analysis = pyJson.RootElement.Clone(),
            });
        }
        finally
        {
            TryDelete(inputTempPath);
        }
    }

    /// <summary>Quick health check for the frontend.</summary>
    [HttpGet("health")]
    public IActionResult Health() => Ok(new { ok = true, service = "BodycamApi", time = DateTime.UtcNow });

    private async Task EnsureOfficerExistsAsync(string officerId, CancellationToken ct)
    {
        if (await _db.Officers.AnyAsync(o => o.Id == officerId, ct)) return;
        _db.Officers.Add(new Officer
        {
            Id = officerId,
            Name = officerId,
            Badge = officerId,
            Enrolled = false,
        });
        await _db.SaveChangesAsync(ct);
    }

    private static void TryDelete(string path)
    {
        try { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); } catch { /* swallow */ }
    }
}
