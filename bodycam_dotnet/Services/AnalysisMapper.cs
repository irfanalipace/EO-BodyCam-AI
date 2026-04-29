using System.Text.Json;
using BodycamApi.Models;

namespace BodycamApi.Services;

/// <summary>
/// Maps the JSON returned by the Python Flask backend into EF Core entities
/// (Recording + AnalysisResult + Violations). All paths are null-tolerant —
/// the Python response shape is allowed to evolve without breaking the API.
/// </summary>
public static class AnalysisMapper
{
    public static (Recording recording, AnalysisResult analysis, List<Violation> violations)
        Map(JsonDocument doc, string filename, long sizeBytes, string officerId, string? stationId)
    {
        var root = doc.RootElement;

        // ── Recording ───────────────────────────────────────────
        var rec = new Recording
        {
            OfficerId       = officerId,
            Filename        = filename,
            MediaType       = GetString(root, "media_type") ?? "audio",
            DurationSeconds = GetDouble(root, "audio_duration_sec") ?? 0,
            SizeBytes       = sizeBytes,
            StationId       = stationId,
            UploadedAt      = DateTime.UtcNow,
            ProcessedAt     = DateTime.UtcNow,
        };

        // ── AnalysisResult ──────────────────────────────────────
        var greeting = GetObj(root, "greeting") ?? GetObj(root, "greeting_info");
        var diar     = GetObj(root, "diarization");
        var ac       = GetObj(root, "acoustics");
        var ga       = GetObj(root, "gemini_analysis");
        var oa       = ga is null ? null : GetObj(ga.Value, "overall_assessment");
        var em       = ga is null ? null : GetObj(ga.Value, "emotions");
        var va       = GetObj(root, "video_analysis");

        var analysis = new AnalysisResult
        {
            // ── Scoring
            TotalScore     = GetInt(root, "total_score") ?? 0,
            ToneScore      = GetInt(root, "tone_score") ?? 0,
            KwScore        = GetInt(root, "kw_score") ?? 0,
            Severity       = GetString(root, "severity") ?? "NORMAL",
            CriticalCount  = GetInt(root, "critical_count") ?? 0,
            HighCount      = GetInt(root, "high_count") ?? 0,
            MediumCount    = GetInt(root, "medium_count") ?? 0,

            // ── Tone
            ToneLabel          = GetString(root, "tone_label") ?? "NORMAL",
            TonePercentNormal  = GetIntFromObj(root, "tone_percents", "NORMAL"),
            TonePercentHarsh   = GetIntFromObj(root, "tone_percents", "HARSH"),
            TonePercentAngry   = GetIntFromObj(root, "tone_percents", "ANGRY"),
            TonePercentBribe   = GetIntFromObj(root, "tone_percents", "BRIBE_TONE"),

            // ── Transcripts
            TranscriptUrdu       = GetString(root, "transcript_urdu") ?? GetString(root, "transcript"),
            TranscriptEnglish    = GetString(root, "transcript_english"),
            TranscriptionMethod  = GetString(root, "transcription_method"),

            // ── EO
            EoDetected   = GetBool(root, "eo_detected") ?? false,
            EoSimilarity = GetDouble(root, "max_similarity") ?? 0,

            // ── Acoustics
            AvgPitchHz       = ac is null ? null : GetDouble(ac.Value, "avg_pitch_hz"),
            BaselinePitchHz  = ac is null ? null : GetDouble(ac.Value, "baseline_pitch_hz"),
            PitchRatio       = ac is null ? null : GetDouble(ac.Value, "pitch_ratio"),
            AvgEnergy        = ac is null ? null : GetDouble(ac.Value, "avg_energy"),
            LoudDurationSec  = ac is null ? null : GetDouble(ac.Value, "loud_duration_sec"),
            Agitation        = ac is null ? null : GetDouble(ac.Value, "agitation"),

            // ── Greeting
            GreetingCompliance = greeting is null ? null : GetString(greeting.Value, "greeting_compliance"),
            GreetingScore      = greeting is null ? null : GetInt(greeting.Value, "greeting_score"),
            SalamFound         = greeting is null ? null : GetBool(greeting.Value, "salam_found"),
            NameIntroduced     = greeting is null ? null : GetBool(greeting.Value, "name_introduced"),
            StationMentioned   = greeting is null ? null : GetBool(greeting.Value, "station_mentioned"),
            RoleMentioned      = greeting is null ? null : GetBool(greeting.Value, "role_mentioned"),
            ExtractedName      = greeting is null ? null : GetString(greeting.Value, "extracted_name"),
            ExtractedStation   = greeting is null ? null : GetString(greeting.Value, "extracted_station"),
            MatchedOfficerId   = greeting is null ? null : GetString(greeting.Value, "matched_officer_id"),

            // ── Diarization
            SpeakerCount         = diar is null ? null : GetInt(diar.Value, "speaker_count"),
            EoTotalSec           = diar is null ? null : GetDouble(diar.Value, "eo_total_sec"),
            CustomerTotalSec     = diar is null ? null : GetDouble(diar.Value, "customer_total_sec"),
            EoSegmentsCount      = diar is null ? null : GetInt(diar.Value, "eo_segments_count"),
            CustomerSegmentsCount= diar is null ? null : GetInt(diar.Value, "customer_segments_count"),

            // ── Emotions
            DominantEmotion   = em is null ? null : GetString(em.Value, "dominant"),
            EmotionAnger      = em is null ? 0 : GetInt(em.Value, "anger") ?? 0,
            EmotionFrustration= em is null ? 0 : GetInt(em.Value, "frustration") ?? 0,
            EmotionContempt   = em is null ? 0 : GetInt(em.Value, "contempt") ?? 0,
            EmotionIntimidation = em is null ? 0 : GetInt(em.Value, "intimidation") ?? 0,
            EmotionFear       = em is null ? 0 : GetInt(em.Value, "fear") ?? 0,
            EmotionCalm       = em is null ? 0 : GetInt(em.Value, "calm") ?? 0,
            EmotionNeutral    = em is null ? 0 : GetInt(em.Value, "neutral") ?? 0,
            EmotionAgitation  = em is null ? 0 : GetInt(em.Value, "agitation") ?? 0,
            EmotionNarrative  = em is null ? null : GetString(em.Value, "narrative"),

            // ── Narrative
            AiAssessment      = GetString(root, "ai_assessment") ?? (oa is null ? null : GetString(oa.Value, "summary")),
            RecommendedAction = oa is null ? null : GetString(oa.Value, "recommended_action"),

            // ── Video
            VisualRiskScore           = va is null ? null : GetInt(va.Value, "risk_score"),
            VisualSummary             = va is null ? null : GetString(va.Value, "visual_summary"),
            BriberyVisualDetected     = va is null ? null : GetBoolFromObj(va.Value, "bribery_visual",     "detected"),
            AggressivePostureDetected = va is null ? null : GetBoolFromObj(va.Value, "aggressive_posture", "detected"),
            PhysicalContactDetected   = va is null ? null : GetBoolFromObj(va.Value, "physical_contact",   "detected"),
            ConcealedGesturesDetected = va is null ? null : GetBoolFromObj(va.Value, "concealed_gestures", "detected"),
            VisualAnalysisStatus      = va is null ? null : GetString(va.Value, "_status"),
            VisualAnalysisStatusMessage = va is null ? null : GetString(va.Value, "_status_message"),

            RawJson = root.GetRawText(),
            CreatedAt = DateTime.UtcNow,
        };

        // ── Violations list ─────────────────────────────────────
        var violations = new List<Violation>();
        if (root.TryGetProperty("violations", out var viols) && viols.ValueKind == JsonValueKind.Array)
        {
            foreach (var v in viols.EnumerateArray())
            {
                violations.Add(new Violation
                {
                    Type           = GetString(v, "type") ?? "OTHER",
                    Severity       = GetString(v, "severity") ?? "LOW",
                    SeverityLabel  = GetString(v, "severity_label") ?? string.Empty,
                    SeverityIndex  = GetInt(v, "severity_index") ?? 0,
                    Label          = GetString(v, "label") ?? string.Empty,
                    Description    = GetString(v, "description"),
                    Detail         = GetString(v, "detail"),
                    Score          = GetInt(v, "score") ?? 0,
                    ImpactPercent  = GetDouble(v, "impact_percent") ?? 0,
                    KeywordsFound  = JoinKeywords(v),
                    Source         = GetString(v, "source"),
                    CreatedAt      = DateTime.UtcNow,
                });
            }
        }

        return (rec, analysis, violations);
    }

    // ── tiny helpers ───────────────────────────────────────────
    private static JsonElement? GetObj(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Object ? v : null;

    private static string? GetString(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int? GetInt(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object) return null;
        if (!e.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.Number when v.TryGetInt32(out var i) => i,
            JsonValueKind.Number => (int?)v.GetDouble(),
            _ => null,
        };
    }

    private static double? GetDouble(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object) return null;
        if (!e.TryGetProperty(name, out var v)) return null;
        return v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
    }

    private static bool? GetBool(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object) return null;
        if (!e.TryGetProperty(name, out var v)) return null;
        return v.ValueKind == JsonValueKind.True ? true : v.ValueKind == JsonValueKind.False ? false : null;
    }

    private static int? GetIntFromObj(JsonElement e, string objName, string key)
    {
        var inner = GetObj(e, objName);
        return inner is null ? null : GetInt(inner.Value, key);
    }

    private static bool? GetBoolFromObj(JsonElement e, string objName, string key)
    {
        var inner = GetObj(e, objName);
        return inner is null ? null : GetBool(inner.Value, key);
    }

    private static string? JoinKeywords(JsonElement v)
    {
        if (!v.TryGetProperty("keywords_found", out var kf) || kf.ValueKind != JsonValueKind.Array) return null;
        var parts = new List<string>();
        foreach (var k in kf.EnumerateArray())
            if (k.ValueKind == JsonValueKind.String) parts.Add(k.GetString()!);
        return parts.Count == 0 ? null : string.Join(",", parts);
    }
}
