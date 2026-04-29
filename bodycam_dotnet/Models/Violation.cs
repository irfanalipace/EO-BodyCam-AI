using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BodycamApi.Models;

/// <summary>
/// One detected violation row. Multiple per Recording.
/// Mirrors the items in the Python "all_viols" list.
/// </summary>
public class Violation
{
    [Key]
    public long Id { get; set; }

    public long RecordingId { get; set; }
    public Recording? Recording { get; set; }

    /// <summary>Type code, e.g. "RISHWAT", "GALI", "PROLONGED_SHOUTING"</summary>
    [MaxLength(64)]
    public string Type { get; set; } = string.Empty;

    /// <summary>"CRITICAL", "HIGH", "MEDIUM", "LOW"</summary>
    [MaxLength(16)]
    public string Severity { get; set; } = "LOW";

    [MaxLength(16)]
    public string SeverityLabel { get; set; } = string.Empty;     // "CRITICAL 1", "HIGH 2"

    public int SeverityIndex { get; set; }

    [MaxLength(256)]
    public string Label { get; set; } = string.Empty;

    [Column(TypeName = "nvarchar(max)")]
    public string? Description { get; set; }

    [Column(TypeName = "nvarchar(max)")]
    public string? Detail { get; set; }

    public int Score { get; set; }
    public double ImpactPercent { get; set; }

    /// <summary>Comma-separated keywords. JSON would be cleaner but text is portable.</summary>
    [MaxLength(1024)]
    public string? KeywordsFound { get; set; }

    /// <summary>"keyword_detection" / "tone_analysis" / "greeting_detection" / etc.</summary>
    [MaxLength(64)]
    public string? Source { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
