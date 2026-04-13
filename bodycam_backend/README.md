# EO Bodycam AI — Backend

## Setup

```bash
pip install -r requirements.txt
python server.py
# Server starts at http://localhost:5050
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/health | Server + model status |
| GET | /api/officers | List enrolled officers |
| POST | /api/officers/enroll | Enroll new EO voice |
| POST | /api/analyze/upload | Upload audio/video file |
| POST | /api/analyze/sample | Analyze built-in test sample |
| GET | /api/samples | List built-in samples |
| GET | /api/incidents | All violation incidents |
| GET | /api/incidents/<id> | Single incident detail |
| GET | /api/dashboard/stats | Dashboard summary stats |
| POST | /api/livestream/chunk | Live audio chunk (5s) |

## WebSocket Events (Socket.IO)

- `violation_alert` — pushed when CRITICAL/WARNING detected
- `analysis_progress` — pushed during live stream processing
- `join_supervisor` — emit to subscribe to live alerts

## Models

- `models/voiceprint_EO_001.pkl` — EO voice fingerprint (106-dim)
- `models/tone_classifier.pkl`   — SVM classifier (NORMAL/HARSH/BRIBE_TONE)
- `models/model_config.json`     — thresholds + keyword lists

## Violation Types

| Type | Keywords (Urdu) | Score |
|------|-----------------|-------|
| RISHWAT | de do paisa, deal kar, chhod deta hoon | +45 |
| DHAMKI | arrest kar loon ga, jail bharwa doon ga | +40 |
| GALI | gadha, bewaqoof, chup kar | +25 |
| HARASSMENT | akela pakad, teri aukaat | +30 |
| GALAT_CHALLAN | ghalt challan, extra paisa | +20 |
| SHOUTING | Energy > 0.35 RMS | +25 |
| HIGH_PITCH | Pitch > 1.55x enrolled | +15 |

## Production Upgrade

Replace K-Means with Pyannote speaker-diarization-community-1
Replace MFCC cosine with ECAPA-TDNN (SpeechBrain)
Replace simulated transcript with Whisper medium (Urdu)
Connect to SQL Server instead of in-memory store
Use Azure Blob for audio file storage

Grok API
Deepgram API Keys


