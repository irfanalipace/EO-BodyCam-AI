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

    public PythonAnalysisService(HttpClient http, IConfiguration config, ILogger<PythonAnalysisService> log)
    {
        _http = http;
        _log = log;
        _baseUrl = config["PythonBackend:BaseUrl"]?.TrimEnd('/') ?? "http://localhost:5000";
        var timeoutSec = int.TryParse(config["PythonBackend:TimeoutSeconds"], out var t) ? t : 900;
        _http.Timeout = TimeSpan.FromSeconds(timeoutSec);
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

        try
        {
            using var resp = await _http.PostAsync(url, form, ct);
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
