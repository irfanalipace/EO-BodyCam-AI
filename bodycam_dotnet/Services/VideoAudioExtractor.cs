using System.Diagnostics;

namespace BodycamApi.Services;

/// <summary>
/// Extracts the audio track from a video file using ffmpeg, producing a 16 kHz mono WAV.
/// Python's audio pipeline expects 16 kHz mono — matching that here keeps the existing
/// Python logic completely unchanged. We don't ship the visual frames to Python at all
/// for video uploads in this mode; Python sees a pure audio file.
/// </summary>
public class VideoAudioExtractor
{
    private static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".webm", ".mov", ".avi", ".mkv", ".3gp", ".flv", ".wmv", ".m4v"
    };

    private readonly ILogger<VideoAudioExtractor> _log;
    private readonly string _ffmpegPath;

    public VideoAudioExtractor(IConfiguration config, ILogger<VideoAudioExtractor> log)
    {
        _log = log;
        // Allow override via appsettings.json -> "Ffmpeg:Path" in case ffmpeg isn't on PATH.
        _ffmpegPath = config["Ffmpeg:Path"]?.Trim() ?? "ffmpeg";
    }

    public static bool IsVideo(string filename) =>
        VideoExtensions.Contains(Path.GetExtension(filename));

    /// <summary>
    /// Reads <paramref name="inputPath"/> (a video file), runs ffmpeg, and writes a
    /// 16 kHz mono 16-bit WAV to a temp path. Returns the WAV path on success, null otherwise.
    /// Caller is responsible for deleting the returned file when done.
    /// </summary>
    public async Task<string?> ExtractToWavAsync(string inputPath, CancellationToken ct = default)
    {
        if (!File.Exists(inputPath))
        {
            _log.LogWarning("Input video {Path} does not exist", inputPath);
            return null;
        }

        var outputPath = Path.Combine(Path.GetTempPath(),
            $"bodycam_audio_{Guid.NewGuid():N}.wav");

        // ffmpeg args: overwrite, single audio stream, 16 kHz mono 16-bit PCM, no video.
        // -vn: drop video. -ac 1: mono. -ar 16000: 16 kHz. -sample_fmt s16: 16-bit PCM.
        var args = $"-y -i \"{inputPath}\" -vn -ac 1 -ar 16000 -sample_fmt s16 \"{outputPath}\"";

        var psi = new ProcessStartInfo
        {
            FileName = _ffmpegPath,
            Arguments = args,
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
        };

        try
        {
            using var proc = Process.Start(psi)
                ?? throw new InvalidOperationException("Could not start ffmpeg");

            // Drain stderr so the process doesn't deadlock on long videos.
            var stderrTask = proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync(ct);
            var stderr = await stderrTask;

            if (proc.ExitCode != 0)
            {
                _log.LogWarning("ffmpeg failed (exit={Code}): {Err}",
                    proc.ExitCode, stderr.Length > 500 ? stderr[..500] : stderr);
                TryDelete(outputPath);
                return null;
            }

            if (!File.Exists(outputPath) || new FileInfo(outputPath).Length < 1024)
            {
                _log.LogWarning("ffmpeg produced empty/missing WAV at {Out}", outputPath);
                TryDelete(outputPath);
                return null;
            }

            _log.LogInformation("Extracted audio: {Video} → {Wav} ({Size} KB)",
                Path.GetFileName(inputPath), Path.GetFileName(outputPath),
                new FileInfo(outputPath).Length / 1024);
            return outputPath;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "ffmpeg extraction threw");
            TryDelete(outputPath);
            return null;
        }
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { /* swallow */ }
    }
}
