using BodycamApi.Models;
using Microsoft.EntityFrameworkCore;

namespace BodycamApi.Data;

/// <summary>
/// EF Core DbContext for the bodycam_ai MySQL schema.
/// Run `dotnet ef migrations add Initial` then `dotnet ef database update` to create tables.
/// </summary>
public class BodycamDbContext : DbContext
{
    public BodycamDbContext(DbContextOptions<BodycamDbContext> options) : base(options) { }

    public DbSet<Officer>        Officers        => Set<Officer>();
    public DbSet<Recording>      Recordings      => Set<Recording>();
    public DbSet<AnalysisResult> AnalysisResults => Set<AnalysisResult>();
    public DbSet<Violation>      Violations      => Set<Violation>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        // ── Officers ────────────────────────────────────────────
        mb.Entity<Officer>(e =>
        {
            e.ToTable("officers");
            e.HasIndex(o => o.Badge).IsUnique();
        });

        // ── Recordings ──────────────────────────────────────────
        mb.Entity<Recording>(e =>
        {
            e.ToTable("recordings");
            e.HasOne(r => r.Officer)
                .WithMany(o => o.Recordings)
                .HasForeignKey(r => r.OfficerId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(r => r.UploadedAt);
            e.HasIndex(r => r.OfficerId);
            e.HasIndex(r => r.MediaType);
        });

        // ── AnalysisResult (1:1 with Recording) ─────────────────
        mb.Entity<AnalysisResult>(e =>
        {
            e.ToTable("analysis_results");
            e.HasOne(a => a.Recording)
                .WithOne(r => r.AnalysisResult)
                .HasForeignKey<AnalysisResult>(a => a.RecordingId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(a => a.Severity);
            e.HasIndex(a => a.TotalScore);
        });

        // ── Violations (N per Recording) ────────────────────────
        mb.Entity<Violation>(e =>
        {
            e.ToTable("violations");
            e.HasOne(v => v.Recording)
                .WithMany(r => r.Violations)
                .HasForeignKey(v => v.RecordingId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(v => v.Type);
            e.HasIndex(v => v.Severity);
            e.HasIndex(v => v.RecordingId);
        });

        base.OnModelCreating(mb);
    }
}
