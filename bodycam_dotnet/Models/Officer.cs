using System.ComponentModel.DataAnnotations;

namespace BodycamApi.Models;

/// <summary>
/// Enrolled Enforcement Officer (EO). Matches the OFFICERS dict on the Python side.
/// </summary>
public class Officer
{
    [Key]
    [MaxLength(32)]
    public string Id { get; set; } = string.Empty;   // e.g. "EO_001"

    [MaxLength(128)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(64)]
    public string Badge { get; set; } = string.Empty;

    [MaxLength(128)]
    public string? Area { get; set; }

    public bool Enrolled { get; set; }

    [MaxLength(512)]
    public string? VoiceprintPath { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<Recording> Recordings { get; set; } = new();
}
