# Bodycam API — .NET 8 + MySQL

Adds a .NET Web API in front of the existing Python Flask AI backend, persisting every
analysis result to MySQL. **No Python code is changed.**

## Architecture

```
React frontend  →  .NET API (this project, port 8080)  →  Python Flask (port 5000)
                          │                                       │
                          ▼                                       │
                       MySQL                                      │
                       (recordings,                                │
                        analysis_results,                          │
                        violations,                                │
                        officers)                                  │
                          ▲                                       │
                          └──────  stores Python's JSON  ─────────┘
```

The .NET API:
1. Receives the upload from the frontend (same multipart form Python expects)
2. Forwards the file to Python at `http://localhost:5000/api/analyze/upload`
3. Maps Python's JSON response into EF Core entities
4. Persists everything in MySQL
5. Returns Python's response back to the frontend (frontend sees no behaviour change)

## Quick Start

### 1. Install MySQL 8.0+ and create the database

```sql
CREATE DATABASE bodycam_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bodycam'@'localhost' IDENTIFIED BY 'ChangeMe!@#';
GRANT ALL PRIVILEGES ON bodycam_ai.* TO 'bodycam'@'localhost';
FLUSH PRIVILEGES;
```

Update the password in `appsettings.json` → `ConnectionStrings:MySql`.

### 2. Install the .NET 8 SDK

Download from <https://dotnet.microsoft.com/download/dotnet/8.0>.

### 3. Restore and create the schema

```bash
cd bodycam_dotnet
dotnet restore

# Install EF Core CLI (one time):
dotnet tool install --global dotnet-ef

# Create the initial migration and apply it:
dotnet ef migrations add Initial
dotnet ef database update
```

(In Development mode the app will also auto-apply migrations on first run, so the
`database update` step is optional.)

### 4. Run

Make sure the Python backend is running on `localhost:5000`, then:

```bash
dotnet run
```

The API listens on **<http://localhost:8080>**. Swagger UI: <http://localhost:8080/swagger>.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/analysis/upload` | Receives a recording, forwards to Python, stores result |
| `GET`  | `/api/analysis/health` | Service health check |
| `GET`  | `/api/recordings` | Paginated list of stored recordings |
| `GET`  | `/api/recordings/{id}` | Full detail of one recording |
| `GET`  | `/api/recordings/stats` | Dashboard summary stats |
| `GET`  | `/api/officers` | List enrolled officers |
| `GET`  | `/api/officers/{id}` | One officer detail |
| `POST` | `/api/officers` | Create officer |
| `PUT`  | `/api/officers/{id}` | Update officer |

## Database Schema

| Table | Purpose |
|---|---|
| `officers` | Enrolled EOs (mirrors the Python `OFFICERS` dict) |
| `recordings` | One row per upload — file metadata + officer + station |
| `analysis_results` | 1:1 with recording — score, transcript, tone, emotions, video analysis |
| `violations` | N per recording — every detected violation, its score, severity, source |

The full Python JSON response is stored in `analysis_results.raw_json` (MySQL `JSON` type)
so anything not modeled relationally can still be queried with `JSON_EXTRACT(...)`.

## Frontend integration

In `bodycam_frontend/src/pages/Upload.jsx`, change the upload URL from:

```js
fetch('http://localhost:5000/api/analyze/upload', { ... })
```

to:

```js
fetch('http://localhost:8080/api/analysis/upload', { ... })
```

That's the only change. The `analysis` field in the response is the same Python JSON
the React app already consumes.

## Production checklist

- [ ] Change MySQL password in `appsettings.json`
- [ ] Set `ASPNETCORE_ENVIRONMENT=Production`
- [ ] Run behind reverse proxy (Nginx / IIS) with HTTPS
- [ ] Add JWT authentication for station upload endpoints
- [ ] Configure log rotation
- [ ] Schedule MySQL backups
- [ ] Restrict CORS `AllowedOrigins` to known frontend origins only
