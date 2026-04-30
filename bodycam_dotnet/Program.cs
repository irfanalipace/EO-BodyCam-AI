using BodycamApi.Data;
using BodycamApi.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ── Logging (Serilog optional, default Console works fine too) ─────
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

// ── EF Core + Microsoft SQL Server ─────────────────────────────────
var connStr = builder.Configuration.GetConnectionString("MsSql")
    ?? throw new InvalidOperationException("ConnectionStrings:MsSql is not set in appsettings.json");

builder.Services.AddDbContext<BodycamDbContext>(opt =>
    opt.UseSqlServer(connStr,
        sql => sql.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null))
       .EnableSensitiveDataLogging(builder.Environment.IsDevelopment()));

// ── HttpClient to Python Flask ─────────────────────────────────────
builder.Services.AddHttpClient<PythonAnalysisService>();

// ── Video → audio extractor (uses ffmpeg subprocess) ───────────────
builder.Services.AddSingleton<VideoAudioExtractor>();

// ── CORS so the React frontend (Vite/CRA) can talk to us directly ─
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173", "http://localhost:3000" };
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(corsOrigins)
     .AllowAnyMethod()
     .AllowAnyHeader()
     .AllowCredentials()));

// ── Controllers + Swagger ──────────────────────────────────────────
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Bodycam API", Version = "v1",
        Description = "Persists Python AI analysis results in MySQL. Python pipeline is unchanged." });
});

// ── Larger upload limits (videos can be hundreds of MB) ─────────────
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 2L * 1024 * 1024 * 1024);

var app = builder.Build();

// ── Pipeline ───────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Bodycam API v1"));
}
app.UseCors();
app.UseRouting();
app.MapControllers();
app.MapGet("/", () => Results.Redirect("/swagger"));

// ── Auto-apply pending EF migrations on startup (dev convenience) ──
if (app.Environment.IsDevelopment())
{
    try
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BodycamDbContext>();
        db.Database.Migrate();
        app.Logger.LogInformation("MySQL schema is up to date.");
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Could not apply EF migrations — make sure MySQL is reachable.");
    }
}

app.Run();
