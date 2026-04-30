using System.Net.Http.Headers;
using System.Text.Json;

namespace BodycamApi.Services;

/// <summary>
/// Forwards uploads to the existing Python Flask backend (no Python code changes).
/// Python returns the same JSON structure the React frontend already consumes.
/// </summary>
public class PythonAnalysisService
{
    private readonly HttpClient _http;
    private readonly ILogger<PythonAnalysisService> _log;
    private readonly string _baseUrl;
    private readonly string? _geminiKey;
    private readonly string? _geminiModel;

    public PythonAnalysisService(HttpClient http, IConfiguration config, ILogger<PythonAnalysisService> log)
    {
        _http = http;
        _log = log;
        // Accept both "Python:BaseUrl" (new) and "PythonBackend:BaseUrl" (legacy).
        _baseUrl = (config["Python:BaseUrl"] ?? config["PythonBackend:BaseUrl"])
                       ?.TrimEnd('/') ?? "http://localhost:5050";
        var timeoutStr = config["Python:TimeoutSeconds"] ?? config["PythonBackend:TimeoutSeconds"];
        var timeoutSec = int.TryParse(timeoutStr, out var t) ? t : 900;
        _http.Timeout = TimeSpan.FromSeconds(timeoutSec);

        // Gemini secrets live in appsettings.json; forwarded to Python per request.
        _geminiKey   = config["Gemini:ApiKey"]?.Trim();
        _geminiModel = config["Gemini:Model"]?.Trim();
    }

    /// <summary>
    /// Streams the uploaded file to Python's /api/analyze/upload endpoint and
    /// returns the full JSON response as a JsonDocument the caller can mine.
    /// </summary>
    public async Task<JsonDocument?> AnalyzeUploadAsync(
        Stream fileStream, string filename, string officerId, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        var fileContent = new StreamContent(fileStream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(fileContent, "audio", filename);
        form.Add(new StringContent(officerId), "officer_id");

        var url = $"{_baseUrl}/api/analyze/upload";
        _log.LogInformation("Forwarding upload {File} (officer {Officer}) → {Url}", filename, officerId, url);

        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = form };
        if (!string.IsNullOrWhiteSpace(_geminiKey))
            req.Headers.TryAddWithoutValidation("X-Gemini-Api-Key", _geminiKey);
        if (!string.IsNullOrWhiteSpace(_geminiModel))
            req.Headers.TryAddWithoutValidation("X-Gemini-Model", _geminiModel);

        try
        {
            using var resp = await _http.SendAsync(req, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
            {
                _log.LogWarning("Python backend returned {Status}: {Body}", resp.StatusCode, body[..Math.Min(500, body.Length)]);
                return null;
            }
            return JsonDocument.Parse(body);
        }
        catch (TaskCanceledException tex) when (!ct.IsCancellationRequested)
        {
            _log.LogError(tex, "Python backend timed out after {Sec}s on {File}", _http.Timeout.TotalSeconds, filename);
            return null;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Python backend call failed for {File}", filename);
            return null;
        }
    }
}
