using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BodycamApi.Models;

/// <summary>
/// One uploaded bodycam recording. One Recording → one AnalysisResult (1:1).
/// </summary>
public class Recording
{
    [Key]
    public long Id { get; set; }

    [MaxLength(32)]
    public string OfficerId { get; set; } = string.Empty;
    public Officer? Officer { get; set; }

    [MaxLength(256)]
    public string Filename { get; set; } = string.Empty;

    /// <summary>"audio" or "video"</summary>
    [MaxLength(16)]
    public string MediaType { get; set; } = "audio";

    public double DurationSeconds { get; set; }
    public long SizeBytes { get; set; }

    [MaxLength(64)]
    public string? StationId { get; set; }

    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Where the original media file is stored (S3 key or local path).
    /// Optional — Python's tempfile is deleted after analysis.
    /// </summary>
    [MaxLength(1024)]
    public string? StoragePath { get; set; }

    public AnalysisResult? AnalysisResult { get; set; }
    public List<Violation> Violations { get; set; } = new();
}
