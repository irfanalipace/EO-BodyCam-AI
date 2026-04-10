"""
EO Bodycam AI — Backend API v5.0
Complete Enforcement Officer Monitoring System
Detects: NORMAL, HARSH, ANGRY, BRIBE_TONE emotions
Keywords: 500+ Urdu/English/Punjabi violation words in 10 categories
Transcription: Groq whisper-large-v3 (primary) + local whisper-small + Google Speech
Categories: RISHWAT, DHAMKI, GALI, RUDE_BEHAVIOR, HARASSMENT,
           GALAT_CHALLAN, ANGRY_TONE, POWER_ABUSE, INTIMIDATION, UNPROFESSIONAL
Severity: NORMAL / WARNING / CRITICAL
"""
import os, json, pickle, time, uuid, tempfile
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
try:
    import psutil
except ImportError:
    psutil = None
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import numpy as np
import librosa
import speech_recognition as sr_lib

BASE    = os.path.dirname(os.path.abspath(__file__))
MODELS  = os.path.join(BASE, "models")
SAMPLES = os.path.join(BASE, "audio_samples")
UPLOADS = os.path.join(BASE, "uploads")
SR      = 16000
os.makedirs(UPLOADS, exist_ok=True)

app = Flask(__name__)
app.config["SECRET_KEY"] = "eo-bodycam-v50"
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# ═══════════════════════════════════════════════════════════════
#  LOAD AI MODELS
# ═══════════════════════════════════════════════════════════════
print("Loading AI models...", flush=True)
with open(f"{MODELS}/voiceprint_EO_001.pkl", "rb") as f:
    ENROLLMENT = pickle.load(f)
with open(f"{MODELS}/tone_classifier.pkl", "rb") as f:
    TONE_MODEL = pickle.load(f)
with open(f"{MODELS}/model_config.json", "r", encoding="utf-8") as f:
    CONFIG = json.load(f)

EO_VECTOR      = np.array(ENROLLMENT["voiceprint"]["vector"])
EO_THRESHOLD   = CONFIG["eo_similarity_threshold"]
ENROLLED_PITCH = ENROLLMENT["voiceprint"]["f0_mean"]
VK             = CONFIG["violation_keywords"]

# ═══════════════════════════════════════════════════════════════
#  LOAD FASTER-WHISPER (small model, int8 for CPU)
# ═══════════════════════════════════════════════════════════════
WHISPER_MODEL = None
try:
    from faster_whisper import WhisperModel
    disk_free = psutil.disk_usage('/').free / (1024**3) if psutil else 0
    ram_total = psutil.virtual_memory().total / (1024**3) if psutil else 0
    whisper_size = CONFIG.get("whisper_model", "small")
    whisper_device = CONFIG.get("whisper_device", "cpu")
    whisper_compute = CONFIG.get("whisper_compute_type", "int8")
    print(f"Loading faster-whisper {whisper_size} ({whisper_device}, {whisper_compute}, "
          f"disk={disk_free:.1f}GB free, RAM={ram_total:.0f}GB)...", flush=True)
    WHISPER_MODEL = WhisperModel(whisper_size, device=whisper_device, compute_type=whisper_compute)
    print(f"faster-whisper {whisper_size} loaded successfully", flush=True)
except ImportError:
    print("faster-whisper not installed — falling back to Google Speech only", flush=True)
except Exception as e:
    print(f"faster-whisper load error: {e}", flush=True)

RECOGNIZER = sr_lib.Recognizer()
print(f"Speech Recognition ready — Google Urdu/English/Punjabi active", flush=True)

kw_total = sum(len(v["words"]) for v in VK.values())
print(f"EO pitch={ENROLLED_PITCH:.1f}Hz  threshold={EO_THRESHOLD}", flush=True)
print(f"Emotions: NORMAL / HARSH / ANGRY / BRIBE_TONE", flush=True)
print(f"Thresholds: warning={CONFIG['warning_score']} critical={CONFIG['critical_score']}", flush=True)
print(f"Keywords: {kw_total} Urdu words in {len(VK)} categories", flush=True)

OFFICERS = {
    "EO_001": {"name": "Ali Hassan",    "badge": "PK-LHR-001", "enrolled": True,  "area": "Lahore - Anarkali"},
    "EO_002": {"name": "Umar Farooq",   "badge": "PK-LHR-002", "enrolled": False, "area": "Lahore - Model Town"},
    "EO_003": {"name": "Fatima Malik",   "badge": "PK-KHI-001", "enrolled": False, "area": "Karachi - Saddar"},
}
INCIDENTS = []


# ═══════════════════════════════════════════════════════════════
#  AUDIO FEATURE EXTRACTION (106-dim MFCC vector)
# ═══════════════════════════════════════════════════════════════
def extract_features(audio, sr=SR):
    if len(audio) < sr * 0.2:
        return np.zeros(106)
    mfccs  = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=40)
    m_mean = np.mean(mfccs, axis=1)
    m_std  = np.std(mfccs,  axis=1)
    sc     = float(np.mean(librosa.feature.spectral_centroid(y=audio, sr=sr)))
    sb     = float(np.mean(librosa.feature.spectral_bandwidth(y=audio, sr=sr)))
    sro    = float(np.mean(librosa.feature.spectral_rolloff(y=audio, sr=sr)))
    scon   = np.mean(librosa.feature.spectral_contrast(y=audio, sr=sr), axis=1)
    zcr    = float(np.mean(librosa.feature.zero_crossing_rate(y=audio)))
    chroma = np.mean(librosa.feature.chroma_stft(y=audio, sr=sr), axis=1)
    rms    = float(np.mean(librosa.feature.rms(y=audio)))
    try:
        f0, vf, _ = librosa.pyin(audio, sr=sr, fmin=65, fmax=500)
        fv  = f0[vf] if vf is not None else np.array([])
        f0m = float(np.mean(fv)) if len(fv) > 0 else 0.0
        f0s = float(np.std(fv))  if len(fv) > 0 else 0.0
    except:
        f0m, f0s = 0.0, 0.0
    return np.concatenate([m_mean, m_std, scon, chroma, [sc, sb, sro, f0m, f0s, zcr, rms]])


def cosine_sim(a, b):
    a, b   = np.array(a), np.array(b)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return float(np.dot(a, b) / (na * nb)) if na > 0 and nb > 0 else 0.0


# ═══════════════════════════════════════════════════════════════
#  VOICE ACTIVITY DETECTION (VAD)
# ═══════════════════════════════════════════════════════════════
def run_vad(audio, sr=SR):
    frame = int(sr * 0.030)
    hop   = frame // 2
    segs, in_s, t0 = [], False, 0.0
    for i in range(0, len(audio) - frame, hop):
        chunk  = audio[i:i + frame]
        energy = float(np.sqrt(np.mean(chunk ** 2)))
        zcr    = float(np.mean(np.abs(np.diff(np.sign(chunk)))) / 2)
        sp     = energy > 0.005 and zcr < 0.40
        ts     = i / sr
        if sp and not in_s:
            in_s, t0 = True, ts
        elif not sp and in_s:
            in_s = False
            if ts - t0 >= 0.20:
                segs.append({"start": t0, "end": ts})
    if in_s:
        segs.append({"start": t0, "end": len(audio) / sr})
    merged = []
    for s in segs:
        if merged and s["start"] - merged[-1]["end"] < 0.4:
            merged[-1]["end"] = s["end"]
        else:
            merged.append(s)
    return merged


# ═══════════════════════════════════════════════════════════════
#  EO VOICE IDENTIFICATION (cosine similarity)
# ═══════════════════════════════════════════════════════════════
def identify_eo_audio(audio, sr, speech_segs):
    window = sr * 2
    sims, eo_parts = [], []
    for seg in speech_segs:
        sa = audio[int(seg["start"] * sr):int(seg["end"] * sr)]
        for w in range(0, len(sa) - window, window // 2):
            chunk = sa[w:w + window]
            vec   = extract_features(chunk, sr)
            sim   = cosine_sim(EO_VECTOR, vec)
            sims.append(sim)
            if sim >= EO_THRESHOLD:
                eo_parts.append(chunk)
    eo = np.concatenate(eo_parts) if eo_parts else np.array([])
    return eo, float(np.mean(sims)) if sims else 0.0, float(np.max(sims)) if sims else 0.0


# ═══════════════════════════════════════════════════════════════
#  TRANSCRIPTION — faster-whisper (primary) + Google Speech (fallback)
# ═══════════════════════════════════════════════════════════════
def normalize_urdu_text(text):
    """Remove Urdu diacritics/tashkeel and normalize Unicode for better matching."""
    import unicodedata
    # Remove Urdu diacritics (zabar, zer, pesh, tashdeed, sukun, etc.)
    diacritics = set('\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652\u0653\u0654\u0655\u0670')
    text = ''.join(c for c in text if c not in diacritics)
    # Normalize Unicode (NFC)
    text = unicodedata.normalize('NFC', text)
    # Normalize common Urdu character variants
    text = text.replace('\u06cc', '\u06cc')  # yeh variants
    text = text.replace('\u0649', '\u06cc')  # alef maksura -> yeh
    text = text.replace('\u064a', '\u06cc')  # arabic yeh -> urdu yeh
    text = text.replace('\u06a9', '\u06a9')  # kaf variants
    text = text.replace('\u0643', '\u06a9')  # arabic kaf -> urdu kaf
    text = text.replace('\u06c1', '\u06c1')  # heh goal
    text = text.replace('\u06be', '\u06c1')  # heh doachashmee -> heh goal (for matching)
    # Collapse multiple spaces
    text = ' '.join(text.split())
    return text


def _groq_transcribe(audio_path):
    """Transcribe via Groq API (free whisper-large-v3 — best Urdu accuracy)."""
    import requests
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        return ""
    try:
        with open(audio_path, "rb") as f:
            resp = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {groq_key}"},
                files={"file": ("audio.wav", f, "audio/wav")},
                data={
                    "model": "whisper-large-v3",
                    "language": "ur",
                    "response_format": "text",
                },
                timeout=30,
            )
        if resp.status_code == 200:
            text = resp.text.strip()
            if text:
                print(f"  [groq-large-v3] {text[:200]}", flush=True)
                return text
        else:
            print(f"  Groq API error {resp.status_code}: {resp.text[:100]}", flush=True)
    except Exception as e:
        print(f"  Groq API error: {e}", flush=True)
    return ""


def auto_transcribe(audio, sample_rate=SR):
    """Transcribe audio — Urdu, English, Punjabi.

    Priority pipeline (stops at first success):
      1. Groq API whisper-large-v3 (FREE, best Urdu accuracy)
      2. Local faster-whisper small (fallback if Groq unavailable)
      3. Google Speech ur-PK + en-PK + pa-PK (extra coverage, parallel)
    """
    import soundfile as sf
    from concurrent.futures import ThreadPoolExecutor

    audio_clip = audio[:sample_rate * 60] if len(audio) > sample_rate * 60 else audio

    # Normalize volume
    peak = np.max(np.abs(audio_clip))
    if peak > 0:
        audio_clip = audio_clip / peak * 0.95

    # Save to temp WAV
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            sf.write(f.name, audio_clip.astype(np.float32), sample_rate)
            tmp = f.name
    except Exception as e:
        print(f"  Failed to save temp audio: {e}", flush=True)
        return "", "error"

    transcript_parts = []
    method = "none"

    # ═══════════════════════════════════════════════════════════
    #  1. GROQ API — whisper-large-v3 (FREE, best accuracy for Urdu)
    # ═══════════════════════════════════════════════════════════
    groq_text = _groq_transcribe(tmp)
    if groq_text:
        transcript_parts.append(groq_text)
        method = "groq_whisper_large_v3"

    # ═══════════════════════════════════════════════════════════
    #  2. LOCAL WHISPER — fallback if Groq fails or no API key
    # ═══════════════════════════════════════════════════════════
    if not transcript_parts and WHISPER_MODEL is not None:
        try:
            segments, info = WHISPER_MODEL.transcribe(
                tmp,
                language="ur",
                task="transcribe",
                beam_size=3,
                best_of=1,
                temperature=0.0,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=300, speech_pad_ms=200),
            )
            whisper_text = " ".join(seg.text.strip() for seg in segments).strip()
            if whisper_text:
                transcript_parts.append(whisper_text)
                method = "faster_whisper_local"
                print(f"  [whisper-local] {whisper_text[:200]}", flush=True)
        except Exception as e:
            print(f"  whisper-local error: {e}", flush=True)

    # ═══════════════════════════════════════════════════════════
    #  3. GOOGLE SPEECH — Urdu + English + Punjabi (parallel thread)
    # ═══════════════════════════════════════════════════════════
    def _google_transcribe():
        results = []
        try:
            with sr_lib.AudioFile(tmp) as source:
                audio_data = RECOGNIZER.record(source)
            for lang, label in [("ur-PK", "google-ur"), ("en-PK", "google-en"), ("pa-PK", "google-pa")]:
                try:
                    text = RECOGNIZER.recognize_google(audio_data, language=lang)
                    if text and text.strip() and text.strip() not in [r[1] for r in results]:
                        results.append((label, text.strip()))
                except (sr_lib.UnknownValueError, sr_lib.RequestError):
                    pass
        except Exception as e:
            print(f"  Google Speech error: {e}", flush=True)
        return results

    google_future = None
    try:
        executor = ThreadPoolExecutor(max_workers=1)
        google_future = executor.submit(_google_transcribe)
    except Exception:
        pass

    if google_future:
        try:
            google_results = google_future.result(timeout=15)
            for label, text in google_results:
                if text not in transcript_parts:
                    transcript_parts.append(text)
                    if method == "none":
                        method = "google_speech"
                    print(f"  [{label}] {text[:150]}", flush=True)
        except Exception:
            print("  Google Speech timeout/error", flush=True)

    # Cleanup
    try:
        os.unlink(tmp)
    except:
        pass

    if not transcript_parts:
        print("  No transcript from any engine", flush=True)
        return "", "no_speech_detected"

    transcript = " | ".join(transcript_parts)
    print(f"  Final [{method}]: {transcript[:200]}", flush=True)

    return transcript, method


# ═══════════════════════════════════════════════════════════════
#  PUNJABI GURMUKHI → ROMAN TRANSLITERATION
# ═══════════════════════════════════════════════════════════════
def transliterate_punjabi_to_roman(text):
    """Convert Punjabi Gurmukhi script to Roman for keyword matching."""
    punjabi_map = {
        # Bribe / money
        "ਰਿਸ਼ਵਤ": "rishwat", "ਪੈਸੇ": "paise", "ਪੈਸਾ": "paisa",
        "ਪੈਸੇ ਦੇ ਦੇ": "paise de do", "ਪੈਸੇ ਕੱਢ": "paise nikal",
        "ਛੱਡ ਦੇ": "chhod do", "ਜਾਣ ਦੇ": "jaane do",
        "ਮਾਫ਼": "maaf", "ਡੀਲ": "deal", "ਸਮਝੌਤਾ": "samjhota",
        "ਚਾਹ ਪਾਣੀ": "chai paani", "ਨੋਟ": "note",
        # Threat
        "ਗ੍ਰਿਫ਼ਤਾਰ": "arrest", "ਜੇਲ੍ਹ": "jail", "ਜੇਲ": "jail",
        "ਥਾਣਾ": "thana", "ਥਾਣੇ": "thane",
        "ਮਾਰ": "maar", "ਮਾਰਾਂਗਾ": "marunga",
        "ਫੜ ਲਵਾਂਗਾ": "pakad loon ga", "ਫੜ": "pakad",
        "ਘਰ ਦਾ ਪਤਾ": "ghar ka pata",
        "ਤੋੜ ਦਿਆਂਗਾ": "tod doon ga",
        "ਬਰਬਾਦ": "barbaad", "ਥੱਪੜ": "thappad",
        "ਕੇਸ": "case", "ਚਲਾਨ": "challan",
        # Abuse
        "ਗਧਾ": "gadha", "ਗਧੇ": "gadhe",
        "ਬੇਵਕੂਫ਼": "bewaqoof", "ਬੇਵਕੂਫ": "bewaqoof",
        "ਜਾਹਿਲ": "jahil", "ਪਾਗਲ": "pagal",
        "ਬੇਸ਼ਰਮ": "besharam",
        "ਕਮੀਨਾ": "kamina", "ਕਮੀਨੇ": "kamine",
        "ਹਰਾਮੀ": "harami", "ਹਰਾਮਖੋਰ": "haramkhor",
        "ਝੂਠਾ": "jhoota", "ਕੁੱਤਾ": "kutta", "ਕੁੱਤੇ": "kutte",
        "ਸੂਰ": "suar", "ਨਾਲਾਇਕ": "nalayak",
        "ਬਦਤਮੀਜ਼": "badtameez", "ਬਦਤਮੀਜ਼ੀ": "badtameezi",
        "ਜ਼ਲੀਲ": "zaleel", "ਲਾਹਨਤ": "laanat",
        "ਚੋਰ": "chor", "ਡਾਕੂ": "dakait", "ਬਦਮਾਸ਼": "badmaash",
        "ਉੱਲੂ": "ullu", "ਸਾਲਾ": "saala", "ਸਾਲੀ": "saali",
        "ਕੰਜਰ": "kanjar", "ਬੇਗ਼ੈਰਤ": "beghairat",
        "ਅਹਿਮਕ": "ahmaq", "ਹਰਾਮਜ਼ਾਦਾ": "haramzada",
        # Rude
        "ਚੁੱਪ": "chup", "ਚੁੱਪ ਕਰ": "chup kar", "ਚੁੱਪ ਰਹਿ": "chup raho",
        "ਹੱਟ": "hat", "ਨਿਕਲ ਜਾ": "nikal jao",
        "ਜ਼ਬਾਨ": "zuban", "ਹੈਸੀਅਤ": "haisiyat", "ਹਿੰਮਤ": "himmat",
        "ਔਕਾਤ": "auqat", "ਬਕਵਾਸ": "bakwaas",
        "ਤਮੀਜ਼": "tameez", "ਐਟੀਟਿਊਡ": "attitude",
        # Harassment
        "ਨੌਕਰੀ": "naukri", "ਦੁਕਾਨ": "dukaan",
        "ਬਦਨਾਮ": "badnaam", "ਇੱਜ਼ਤ": "izzat",
        "ਖ਼ਾਨਦਾਨ": "khandaan", "ਜ਼ਿੰਦਗੀ": "zindagi", "ਹਰਾਮ": "haraam",
        # Angry
        "ਗੁੱਸਾ": "gussa", "ਚੀਕ": "cheekh", "ਚਿੱਲਾ": "chilla",
        "ਡਾਂਟ": "daant", "ਸ਼ੋਰ": "shor",
        # Power
        "ਅਫ਼ਸਰ": "officer", "ਕਾਨੂੰਨ": "kanoon",
        "ਹੁਕਮ": "hukum", "ਸ਼ਿਕਾਇਤ": "shikayat",
        "ਲਾਇਸੈਂਸ": "license", "ਸੀਲ": "seal", "ਰੇਡ": "raid",
        # Intimidation
        "ਡਰ": "dar", "ਅੰਜਾਮ": "anjaam", "ਨਤੀਜਾ": "nateeja",
        "ਮੌਕਾ": "mauka", "ਸਬਕ": "sabaq", "ਅੱਗ": "aag",
        # Galat challan
        "ਗ਼ਲਤ": "galat", "ਗਲਤ": "galat", "ਗਲਤ ਚਲਾਨ": "galat challan",
        "ਰਸੀਦ": "receipt",
    }
    result = text
    for punjabi, roman in sorted(punjabi_map.items(), key=lambda x: -len(x[0])):
        result = result.replace(punjabi, roman)
    return result


def transliterate_urdu_to_roman(text):
    """Convert Urdu script to Roman Urdu for keyword matching."""
    mapping = {
        # Bribe
        "\u0631\u0634\u0648\u062a": "rishwat",
        "\u067e\u06cc\u0633\u06d2": "paisay", "\u067e\u06cc\u0633\u0627": "paisa",
        "\u067e\u06cc\u0633\u06d2 \u062f\u06d2 \u062f\u0648": "paisy de do",
        "\u067e\u06cc\u0633\u06d2 \u062f\u0648": "paisy do",
        "\u067e\u06cc\u0633\u06d2 \u0646\u06a9\u0627\u0644": "paisy nikal",
        "\u0686\u06be\u0648\u0691 \u062f\u0648": "chhod do",
        "\u062c\u0627\u0646\u06d2 \u062f\u0648": "jaane do",
        "\u0645\u0639\u0627\u0641": "maaf",
        "\u0644\u06cc\u0646 \u062f\u06cc\u0646": "lein dein",
        "\u0645\u0639\u0627\u0645\u0644\u06c1": "mamla",
        "\u0633\u0645\u062c\u06be\u0648\u062a\u0627": "samjhota",
        "\u0688\u06cc\u0644": "deal",
        "\u0646\u067e\u0679\u0627": "nipta",
        "\u0686\u0627\u0626\u06d2 \u067e\u0627\u0646\u06cc": "chai paani",
        "\u067e\u0631\u0686\u06cc": "parchi",
        "\u0646\u0648\u0679": "note",
        "\u062d\u0633\u0627\u0628": "hisaab",
        # Threat
        "\u06af\u0631\u0641\u062a\u0627\u0631": "arrest",
        "\u062c\u06cc\u0644": "jail", "\u062b\u0627\u0646\u0627": "thana",
        "\u0645\u0627\u0631 \u062f\u0648\u06ba \u06af\u0627": "maar doon ga",
        "\u0645\u0627\u0631\u0648\u06ba\u06af\u0627": "marunga",
        "\u067e\u06a9\u0691 \u0644\u0648\u06ba \u06af\u0627": "pakad loon ga",
        "\u06af\u06be\u0631 \u06a9\u0627 \u067e\u062a\u06c1": "ghar ka pata",
        "\u062a\u0648\u0691 \u062f\u0648\u06ba \u06af\u0627": "tod doon ga",
        "\u062e\u062a\u0645 \u06a9\u0631": "khatam kar",
        "\u0628\u0631\u0628\u0627\u062f \u06a9\u0631": "barbaad kar",
        "\u062a\u06be\u067e\u0691": "thappad",
        "\u067e\u0679\u0627\u0626\u06cc": "pitai",
        "\u06a9\u06cc\u0633": "case",
        "\u0686\u0627\u0644\u0627\u0646": "challan",
        # Abuse
        "\u06af\u062f\u06be\u0627": "gadha", "\u06af\u062f\u06be\u06d2": "gadhe",
        "\u0628\u06d2\u0648\u0642\u0648\u0641": "bewaqoof",
        "\u062c\u0627\u06c1\u0644": "jahil", "\u067e\u0627\u06af\u0644": "pagal",
        "\u0628\u06d2\u0634\u0631\u0645": "besharam",
        "\u06a9\u0645\u06cc\u0646\u06d2": "kamine", "\u06a9\u0645\u06cc\u0646\u0627": "kamina",
        "\u062d\u0631\u0627\u0645\u06cc": "harami", "\u062d\u0631\u0627\u0645\u062e\u0648\u0631": "haramkhor",
        "\u062c\u06be\u0648\u0679\u0627": "jhoota",
        "\u06a9\u062a\u0651\u0627": "kutta", "\u06a9\u062a\u0651\u06d2": "kutte",
        "\u0633\u0624\u0631": "suar",
        "\u0646\u0627\u0644\u0627\u0626\u0642": "nalayak",
        "\u0628\u062f\u062a\u0645\u06cc\u0632": "badtameez",
        "\u0630\u0644\u06cc\u0644": "zaleel", "\u0644\u0639\u0646\u062a": "laanat",
        "\u0686\u0648\u0631": "chor", "\u0688\u0627\u06a9\u0648": "dakait",
        "\u0628\u062f\u0645\u0639\u0627\u0634": "badmaash",
        "\u0627\u0644\u0648": "ullu",
        "\u0633\u0627\u0644\u0627": "saala", "\u0633\u0627\u0644\u06cc": "saali",
        "\u06a9\u0646\u062c\u0631": "kanjar",
        "\u0628\u06d2 \u063a\u06cc\u0631\u062a": "beghairat",
        "\u0627\u062d\u0645\u0642": "ahmaq",
        "\u062d\u0631\u0627\u0645\u0632\u0627\u062f\u06c1": "haramzada",
        # Rude
        "\u0686\u067e": "chup", "\u0686\u067e \u0631\u06c1\u0648": "chup raho",
        "\u06c1\u0679\u0648": "hato", "\u0646\u06a9\u0644 \u062c\u0627\u0624": "nikal jao",
        "\u0632\u0628\u0627\u0646": "zuban",
        "\u062d\u06cc\u062b\u06cc\u062a": "haisiyat",
        "\u06c1\u0645\u062a": "himmat",
        "\u0627\u0648\u0642\u0627\u062a": "auqat",
        # Harassment
        "\u0646\u0648\u06a9\u0631\u06cc": "naukri",
        "\u062f\u06a9\u0627\u0646": "dukaan",
        "\u0628\u062f\u0646\u0627\u0645": "badnaam",
        "\u0639\u0632\u062a": "izzat",
        "\u062e\u0627\u0646\u062f\u0627\u0646": "khandaan",
        "\u0632\u0646\u062f\u06af\u06cc": "zindagi",
        "\u062d\u0631\u0627\u0645": "haraam",
        # Angry
        "\u063a\u0635\u0651\u0627": "gussa",
        "\u0686\u06cc\u062e": "cheekh", "\u0686\u0644\u0627": "chilla",
        "\u0688\u0627\u0646\u0679": "daant",
        "\u0634\u0648\u0631": "shor",
        # Power abuse
        "\u0627\u062e\u062a\u06cc\u0627\u0631": "ikhtiyaar",
        "\u0622\u0641\u06cc\u0633\u0631": "officer",
        "\u0642\u0627\u0646\u0648\u0646": "kanoon",
        "\u062d\u06a9\u0645": "hukum",
        "\u0634\u06a9\u0627\u06cc\u062a": "shikayat",
        "\u0644\u0627\u0626\u0633\u0646\u0633": "license",
        "\u0633\u06cc\u0644": "seal",
        "\u0646\u0648\u0679\u0633": "notice",
        "\u0631\u06cc\u0688": "raid",
        # Intimidation
        "\u0688\u0631": "dar",
        "\u0627\u0646\u062c\u0627\u0645": "anjaam",
        "\u0646\u062a\u06cc\u062c\u06c1": "nateeja",
        "\u0648\u0627\u0631\u0646\u0646\u06af": "warning",
        "\u0645\u0648\u0642\u0639": "mauka",
        "\u0633\u0628\u0642": "sabaq",
        "\u0622\u06af": "aag",
        # General
        "\u063a\u0644\u0637 \u0686\u0627\u0644\u0627\u0646": "galat challan",
        # Rude / attitude
        "\u0628\u06a9\u0648\u0627\u0633": "bakwaas",
        "\u062a\u0645\u06cc\u0632": "tameez",
        "\u0627\u06cc\u0679\u06cc\u0679\u06cc\u0648\u0688": "attitude",
        # Extra bribe
        "\u067e\u06cc\u0633\u06d2 \u062f\u06d2": "paisay de",
        "\u067e\u06cc\u0633\u06d2 \u0644\u0627\u0624": "paisay lao",
        "\u067e\u06cc\u0633\u06d2 \u0646\u06a9\u0627\u0644\u0648": "paisay nikalo",
    }
    result = text
    for urdu, roman in sorted(mapping.items(), key=lambda x: -len(x[0])):
        result = result.replace(urdu, roman)
    return result


# ═══════════════════════════════════════════════════════════════
#  SPELLING NORMALIZATION — handles Whisper spelling variations
# ═══════════════════════════════════════════════════════════════
# Common spelling variations Whisper produces vs what's in keywords
SPELLING_VARIANTS = {
    "bakvaas": "bakwaas", "bakwas": "bakwaas", "bakvas": "bakwaas",
    "bewakuf": "bewaqoof", "bewaquf": "bewaqoof", "bevakoof": "bewaqoof",
    "rishvat": "rishwat", "rishват": "rishwat",
    "paisy": "paise", "pese": "paise", "paise": "paisa",
    "chhup": "chup", "choop": "chup",
    "ghussa": "gussa", "ghusa": "gussa",
    "tameez": "tameez", "tamiz": "tameez", "tameej": "tameez",
    "chalaan": "challan", "chalan": "challan",
    "badtmeez": "badtameez", "badtamiz": "badtameez",
    "kamina": "kamine", "kameena": "kamine",
    "harami": "harami", "haraami": "harami",
    "pagal": "paagal", "pagl": "pagal",
    "bewkoof": "bewaqoof",
    "galat": "galat", "ghalt": "galat",
    "dhamki": "dhamki", "damki": "dhamki",
    "gali": "gali", "gaali": "gali",
}


def normalize_roman_spelling(text):
    """Normalize common Whisper spelling variations to match keywords."""
    words = text.split()
    normalized = []
    for w in words:
        normalized.append(SPELLING_VARIANTS.get(w, w))
    return " ".join(normalized)


# ═══════════════════════════════════════════════════════════════
#  KEYWORD DETECTION — scans transcript for violation words
# ═══════════════════════════════════════════════════════════════
def detect_keywords(transcript):
    """Detect violation keywords from transcribed text.
    Uses multiple text representations for maximum matching:
    1. Original transcript (Urdu script / English / Punjabi)
    2. Urdu → Roman transliteration
    3. Punjabi → Roman transliteration
    4. Normalized spelling variants
    Returns score and list of violations with severity."""
    if not transcript:
        return 0, []

    text = transcript.lower().strip()

    # Build search representations (Urdu, English, Punjabi — NO Hindi)
    text_normalized = normalize_urdu_text(text)
    text_roman_ur = transliterate_urdu_to_roman(text)
    text_roman_pa = transliterate_punjabi_to_roman(text)
    text_spell_fix = normalize_roman_spelling(text_roman_ur)
    text_spell_fix2 = normalize_roman_spelling(text)
    text_spell_fix3 = normalize_roman_spelling(text_roman_pa)

    # Combine all representations for searching
    search_text = " | ".join([
        text, text_normalized,
        text_roman_ur, text_roman_pa,
        text_spell_fix, text_spell_fix2, text_spell_fix3
    ])

    print(f"  [keyword-search] search text: {search_text[:400]}", flush=True)

    score = 0
    viols = []

    for vtype, cfg in VK.items():
        hits = set()
        for word in cfg["words"]:
            w_lower = word.lower().strip()
            if not w_lower:
                continue

            # Normalize the keyword (Urdu + Punjabi only)
            w_normalized = normalize_urdu_text(w_lower)
            w_roman = transliterate_urdu_to_roman(w_lower)
            w_roman_pa = transliterate_punjabi_to_roman(w_lower)
            w_spell = normalize_roman_spelling(w_roman)

            # Check if any variant of the keyword matches in any variant of the text
            variants_to_check = {w_lower, w_normalized, w_roman, w_roman_pa, w_spell}
            for variant in variants_to_check:
                if variant and variant in search_text:
                    # Use Roman version for display
                    if all(ord(c) < 256 for c in word):
                        hits.add(word)
                    else:
                        roman = transliterate_urdu_to_roman(word)
                        if roman != word:
                            hits.add(roman)
                        else:
                            hits.add(word)
                    break  # Found a match, no need to check other variants

        if hits:
            unique_hits = sorted(hits)
            pts = cfg["score"]
            score += pts
            viols.append({
                "type":           vtype,
                "severity":       cfg["severity"],
                "score":          pts,
                "label":          cfg.get("label", vtype),
                "description":    cfg.get("description", ""),
                "detail":         f"Spoken words detected: {', '.join(unique_hits)}",
                "keywords_found": unique_hits,
                "source":         "voice_transcription",
            })

    return min(score, 100), viols


# ═══════════════════════════════════════════════════════════════
#  TONE ANALYSIS — acoustic features (energy, pitch, agitation)
# ═══════════════════════════════════════════════════════════════
def analyze_tone(eo_audio, sr):
    """Acoustic-based tone analysis with normalized audio."""
    tone_proba = {"NORMAL": 1.0, "HARSH": 0.0, "ANGRY": 0.0, "BRIBE_TONE": 0.0}
    acoustics  = {
        "avg_energy": 0.0, "avg_pitch_hz": 0.0,
        "zcr": 0.0, "pitch_variance": 0.0,
        "loud_duration_sec": 0.0, "agitation": 0.0,
        "enrolled_pitch_hz": ENROLLED_PITCH, "pitch_ratio": 0.0,
    }
    tone_score = 0
    tone_viols = []

    if len(eo_audio) < sr * 0.3:
        return "NORMAL", tone_proba, acoustics, 0, []

    # Normalize audio volume
    peak = np.max(np.abs(eo_audio))
    if peak > 0.01:
        norm_audio = eo_audio / peak * 0.9
    else:
        norm_audio = eo_audio

    # Measure features on normalized audio
    rms_energy = float(np.sqrt(np.mean(norm_audio ** 2)))
    rms_frames = librosa.feature.rms(y=norm_audio)[0]
    zcr_val    = float(np.mean(librosa.feature.zero_crossing_rate(y=norm_audio)))

    try:
        f0, vf, _ = librosa.pyin(norm_audio, sr=sr, fmin=65, fmax=500)
        fv        = f0[vf] if vf is not None else np.array([])
        avg_pitch = float(np.mean(fv)) if len(fv) > 0 else 0.0
        pitch_var = float(np.std(fv))  if len(fv) > 0 else 0.0
    except:
        avg_pitch, pitch_var = 0.0, 0.0

    mfcc_delta = librosa.feature.delta(librosa.feature.mfcc(y=norm_audio, sr=sr, n_mfcc=13))
    agitation  = float(np.mean(np.abs(mfcc_delta)))

    # Relative loudness within clip
    rms_sorted = np.sort(rms_frames)
    if len(rms_sorted) > 10:
        quiet_avg = float(np.mean(rms_sorted[:len(rms_sorted)//4]))
        loud_avg  = float(np.mean(rms_sorted[-len(rms_sorted)//4:]))
        loudness_ratio = loud_avg / (quiet_avg + 1e-6)
    else:
        loudness_ratio = 1.0

    loud_frames   = np.sum(rms_frames > CONFIG["loud_frame_energy"])
    loud_duration = float(loud_frames * 512 / sr)
    ratio         = avg_pitch / ENROLLED_PITCH if ENROLLED_PITCH > 0 else 0

    print(f"  Tone: energy={rms_energy:.3f} pitch={avg_pitch:.0f}Hz ratio={ratio:.2f} "
          f"pitch_var={pitch_var:.1f} agitation={agitation:.3f} "
          f"loudness_ratio={loudness_ratio:.1f} loud_dur={loud_duration:.1f}s", flush=True)

    acoustics = {
        "avg_energy":        round(rms_energy, 4),
        "avg_pitch_hz":      round(avg_pitch, 1),
        "zcr":               round(zcr_val, 4),
        "pitch_variance":    round(pitch_var, 1),
        "loud_duration_sec": round(loud_duration, 1),
        "agitation":         round(agitation, 4),
        "enrolled_pitch_hz": round(ENROLLED_PITCH, 1),
        "pitch_ratio":       round(ratio, 2),
    }

    def flag(t, s, pts, d):
        tone_viols.append({
            "type": t, "severity": s, "score": pts,
            "detail": d, "source": "acoustic_analysis",
        })
        return pts

    # Violation detection
    if rms_energy > CONFIG["energy_normal_max"]:
        tone_score += flag("ELEVATED_VOICE", "MEDIUM",
            CONFIG["score_elevated_voice"],
            f"Raised voice: energy {rms_energy:.4f}")

    if rms_energy > CONFIG["energy_shouting_min"]:
        tone_score += flag("SHOUTING", "HIGH",
            CONFIG["score_shouting"],
            f"Shouting detected: energy {rms_energy:.4f}")

    if ratio > CONFIG["pitch_high_ratio"] and avg_pitch > 0:
        tone_score += flag("HIGH_PITCH", "MEDIUM",
            CONFIG["score_high_pitch"],
            f"High pitch {avg_pitch:.0f}Hz = {ratio:.2f}x above baseline {ENROLLED_PITCH:.0f}Hz")

    if ratio > CONFIG["pitch_extreme_ratio"] and avg_pitch > 0:
        tone_score += flag("EXTREME_PITCH", "HIGH",
            CONFIG["score_extreme_pitch"],
            f"Extreme pitch {avg_pitch:.0f}Hz ({ratio:.2f}x baseline)")

    if loud_duration > CONFIG["loud_duration_sec"]:
        tone_score += flag("PROLONGED_SHOUTING", "HIGH",
            CONFIG["score_prolonged_loud"],
            f"Sustained loud speech {loud_duration:.1f}s")

    if agitation > CONFIG["agitation_threshold"]:
        tone_score += flag("AGITATED_SPEECH", "MEDIUM",
            CONFIG["score_agitation"],
            f"Agitated speech: index {agitation:.3f}")

    if loudness_ratio > 4.0:
        tone_score += flag("VOICE_RAISED", "MEDIUM", 10,
            f"Voice raised {loudness_ratio:.1f}x louder than calm parts")

    if pitch_var > 40:
        tone_score += flag("PITCH_UNSTABLE", "MEDIUM", 5,
            f"Unstable pitch: variance {pitch_var:.1f}Hz (angry/emotional)")

    # Determine tone label
    harsh_signals = 0
    if rms_energy > CONFIG["energy_normal_max"]:
        harsh_signals += 1
    if ratio > CONFIG["pitch_high_ratio"] and avg_pitch > 0:
        harsh_signals += 1
    if pitch_var > 40:
        harsh_signals += 1
    if loud_duration > CONFIG["loud_duration_sec"]:
        harsh_signals += 1
    if loudness_ratio > 4.0:
        harsh_signals += 1
    if agitation > CONFIG["agitation_threshold"]:
        harsh_signals += 1

    if harsh_signals >= 3:
        tone_label = "ANGRY"
        tone_proba = {"NORMAL": 0.05, "HARSH": 0.15, "ANGRY": 0.75, "BRIBE_TONE": 0.05}
    elif harsh_signals >= 2:
        tone_label = "HARSH"
        tone_proba = {"NORMAL": 0.10, "HARSH": 0.75, "ANGRY": 0.10, "BRIBE_TONE": 0.05}
    elif harsh_signals >= 1:
        tone_label = "HARSH"
        tone_proba = {"NORMAL": 0.40, "HARSH": 0.45, "ANGRY": 0.05, "BRIBE_TONE": 0.10}
    elif rms_energy < 0.03 and ratio < 0.8 and avg_pitch > 0:
        tone_label = "BRIBE_TONE"
        tone_proba = {"NORMAL": 0.20, "HARSH": 0.05, "ANGRY": 0.05, "BRIBE_TONE": 0.70}
    else:
        tone_label = "NORMAL"
        normal_conf = 1.0
        if rms_energy > 0:
            normal_conf -= min(0.3, rms_energy / CONFIG["energy_normal_max"] * 0.15)
        if ratio > 0:
            normal_conf -= min(0.2, max(0, ratio - 0.8) * 0.2)
        normal_conf = max(0.50, min(0.99, normal_conf))
        harsh_conf  = round((1 - normal_conf) * 0.6, 3)
        bribe_conf  = round((1 - normal_conf) * 0.3, 3)
        angry_conf  = round((1 - normal_conf) * 0.1, 3)
        tone_proba  = {"NORMAL": round(normal_conf, 3), "HARSH": harsh_conf,
                        "ANGRY": angry_conf, "BRIBE_TONE": bribe_conf}

    return tone_label, tone_proba, acoustics, min(tone_score, 50), tone_viols


# ═══════════════════════════════════════════════════════════════
#  BEHAVIOR ASSESSMENT — overall EO behavior rating
# ═══════════════════════════════════════════════════════════════
def assess_behavior(total_score, severity, tone_label, violations, transcript):
    """Generate a detailed behavior assessment for the EO."""
    assessment = {
        "overall_rating": "PROFESSIONAL",
        "behavior_flags": [],
        "recommendation": "",
        "violation_summary": {},
    }

    # Count violations by category
    cat_counts = {}
    for v in violations:
        cat = v["type"]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    assessment["violation_summary"] = cat_counts

    flags = []

    if severity == "CRITICAL":
        assessment["overall_rating"] = "SEVERE_MISCONDUCT"
        flags.append("Immediate disciplinary action recommended")
        flags.append("Recording flagged for supervisory review")

        if any(v["type"] == "RISHWAT" for v in violations):
            flags.append("BRIBERY DETECTED — Anti-corruption unit notification required")
        if any(v["type"] == "DHAMKI" for v in violations):
            flags.append("THREATS DETECTED — Internal affairs review required")
        if any(v["type"] == "POWER_ABUSE" for v in violations):
            flags.append("POWER ABUSE DETECTED — Authority misuse investigation required")

        assessment["recommendation"] = "SUSPEND pending investigation. Forward to Internal Affairs."

    elif severity == "WARNING":
        assessment["overall_rating"] = "UNPROFESSIONAL"
        flags.append("Behavior falls below acceptable standards")

        if tone_label in ("ANGRY", "HARSH"):
            flags.append(f"Tone classified as {tone_label} — de-escalation training recommended")
        if any(v["type"] == "GALI" for v in violations):
            flags.append("Abusive language used — verbal conduct warning required")
        if any(v["type"] == "RUDE_BEHAVIOR" for v in violations):
            flags.append("Rude behavior detected — customer service retraining needed")
        if any(v["type"] == "INTIMIDATION" for v in violations):
            flags.append("Intimidation tactics used — written warning required")

        assessment["recommendation"] = "Issue formal WARNING. Schedule conduct retraining."

    else:
        assessment["overall_rating"] = "PROFESSIONAL"
        flags.append("No significant violations detected")
        flags.append("Behavior within acceptable standards")
        assessment["recommendation"] = "No action required. Continue monitoring."

    assessment["behavior_flags"] = flags
    return assessment


# ═══════════════════════════════════════════════════════════════
#  MAIN ANALYSIS PIPELINE
# ═══════════════════════════════════════════════════════════════
def run_analysis(audio, sr, officer_id="EO_001", source="upload", filename=""):
    t0           = time.time()
    speech_segs  = run_vad(audio, sr)
    total_dur    = len(audio) / sr
    speech_ratio = sum(s["end"] - s["start"] for s in speech_segs) / (total_dur + 1e-9)

    eo_audio, avg_sim, max_sim = identify_eo_audio(audio, sr, speech_segs)
    eo_detected = len(eo_audio) >= sr * CONFIG["min_eo_audio_sec"]
    eo_duration = len(eo_audio) / sr if len(eo_audio) > 0 else 0.0

    analyze_audio = eo_audio if eo_detected and len(eo_audio) > sr * 0.3 else audio

    print(f"  Transcribing ({len(analyze_audio)/sr:.1f}s)...", flush=True)
    transcript, transcription_method = auto_transcribe(analyze_audio, sr)

    tone_label, tone_proba, acoustics, tone_score, tone_viols = analyze_tone(analyze_audio, sr)
    kw_score, kw_viols = detect_keywords(transcript)

    all_viols   = tone_viols + kw_viols
    total_score = min(tone_score + kw_score, 100)
    severity    = (
        "CRITICAL" if total_score >= CONFIG["critical_score"] else
        "WARNING"  if total_score >= CONFIG["warning_score"]  else
        "NORMAL"
    )

    # Behavior assessment
    behavior = assess_behavior(total_score, severity, tone_label, all_viols, transcript)

    print(f"  Score:{total_score} tone={tone_score} kw={kw_score} -> {severity}", flush=True)
    print(f"  Emotion:{tone_label} Violations:{len(all_viols)} Rating:{behavior['overall_rating']}", flush=True)

    incident_id = str(uuid.uuid4())[:8].upper()
    result = {
        "incident_id":          incident_id,
        "officer_id":           officer_id,
        "officer_name":         OFFICERS.get(officer_id, {}).get("name", "Unknown"),
        "officer_badge":        OFFICERS.get(officer_id, {}).get("badge", ""),
        "officer_area":         OFFICERS.get(officer_id, {}).get("area", ""),
        "filename":             filename,
        "source":               source,
        "timestamp":            datetime.now().isoformat(),
        "total_duration_sec":   round(total_dur, 1),
        "speech_segments":      len(speech_segs),
        "speech_ratio":         round(speech_ratio, 2),
        "eo_detected":          eo_detected,
        "eo_speaking_sec":      round(eo_duration, 1),
        "avg_similarity":       round(avg_sim, 3),
        "max_similarity":       round(max_sim, 3),
        "eo_threshold":         EO_THRESHOLD,
        "transcript":           transcript,
        "transcription_method": transcription_method,
        "transcript_source":    "auto_voice_detection",
        "tone_label":           tone_label,
        "tone_proba":           tone_proba,
        "acoustics":            acoustics,
        "violations":           all_viols,
        "tone_score":           tone_score,
        "keyword_score":        kw_score,
        "total_score":          total_score,
        "severity":             severity,
        "behavior_assessment":  behavior,
        "alert_required":       severity != "NORMAL",
        "processing_time_sec":  round(time.time() - t0, 2),
    }

    INCIDENTS.append(result)

    if severity in ("CRITICAL", "WARNING"):
        socketio.emit("violation_alert", {
            "incident_id":        incident_id,
            "officer_id":         officer_id,
            "officer_name":       result["officer_name"],
            "severity":           severity,
            "total_score":        total_score,
            "tone_score":         tone_score,
            "keyword_score":      kw_score,
            "tone_label":         tone_label,
            "violations":         all_viols,
            "behavior_rating":    behavior["overall_rating"],
            "behavior_flags":     behavior["behavior_flags"],
            "recommendation":     behavior["recommendation"],
            "timestamp":          result["timestamp"],
            "filename":           filename,
            "keywords_found":     [kw for v in kw_viols for kw in v.get("keywords_found", [])],
        })

    return result


# ═══════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ═══════════════════════════════════════════════════════════════
@app.route("/api/health")
def health():
    return jsonify({
        "status":             "healthy",
        "version":            "5.0",
        "whisper_model":      CONFIG.get("whisper_model", "small"),
        "whisper_available":  WHISPER_MODEL is not None,
        "models_loaded":      ["voiceprint_EO_001", "tone_classifier", "model_config"],
        "enrolled_pitch":     round(ENROLLED_PITCH, 1),
        "eo_threshold":       EO_THRESHOLD,
        "tone_cv_acc":        round(CONFIG.get("tone_classifier_cv_accuracy", 0) * 100, 1),
        "emotions":           list(TONE_MODEL["label_names"]) if isinstance(TONE_MODEL["label_names"], list) else list(TONE_MODEL["label_names"].values()),
        "keyword_categories": list(VK.keys()),
        "total_keywords":     sum(len(v["words"]) for v in VK.values()),
        "incidents_total":    len(INCIDENTS),
        "officers":           len(OFFICERS),
        "warning_score":      CONFIG["warning_score"],
        "critical_score":     CONFIG["critical_score"],
        "severity_levels":    CONFIG.get("severity_levels", {}),
    })


@app.route("/api/officers")
def get_officers():
    return jsonify({"officers": [{"id": k, **v} for k, v in OFFICERS.items()]})


@app.route("/api/officers/enroll", methods=["POST"])
def enroll_officer():
    officer_id = request.form.get("officer_id", "").strip()
    name       = request.form.get("name", "").strip()
    area       = request.form.get("area", "").strip()
    f          = request.files.get("audio")

    if not officer_id: return jsonify({"error": "Officer ID is required"}), 400
    if not name:       return jsonify({"error": "Full name is required"}), 400
    if not f:          return jsonify({"error": "Audio file is required"}), 400

    suffix = os.path.splitext(f.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        f.save(tmp.name)
        path = tmp.name

    try:
        audio, sr_ = librosa.load(path, sr=SR)
        if len(audio) < sr_ * 3:
            return jsonify({"error": "Audio too short — minimum 3 seconds"}), 400

        window  = sr_ * 2
        vectors = []
        for s in range(0, len(audio) - window, window // 2):
            vectors.append(extract_features(audio[s:s + window], sr_))
        if not vectors:
            vectors = [extract_features(audio, sr_)]

        vp = np.mean(vectors, axis=0)

        try:
            f0, vf, _ = librosa.pyin(audio, sr=sr_, fmin=65, fmax=2093)
            fv    = f0[vf] if vf is not None else np.array([])
            pitch = float(np.mean(fv)) if len(fv) > 0 else 0.0
        except:
            pitch = 0.0

        enrollment_data = {
            "officer_id": officer_id,
            "threshold":  0.82,
            "voiceprint": {
                "vector":              vp.tolist(),
                "vector_std":          np.std(vectors, axis=0).tolist(),
                "f0_mean":             pitch,
                "rms":                 float(np.sqrt(np.mean(audio ** 2))),
                "zcr":                 float(np.mean(librosa.feature.zero_crossing_rate(y=audio))),
                "training_windows":    len(vectors),
                "enrollment_duration": round(len(audio) / sr_, 1),
            },
            "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        pkl_path = os.path.join(MODELS, f"voiceprint_{officer_id}.pkl")
        with open(pkl_path, "wb") as pf:
            pickle.dump(enrollment_data, pf)

        OFFICERS[officer_id] = {
            "name": name, "badge": officer_id,
            "area": area, "enrolled": True,
        }
        print(f"Enrolled: {name} ({officer_id}) pitch={pitch:.1f}Hz", flush=True)

        return jsonify({
            "officer_id": officer_id, "name": name,
            "badge": officer_id, "area": area,
            "enrolled": True, "pitch_hz": round(pitch, 1),
            "windows": len(vectors),
            "message": f"Officer {name} enrolled successfully",
        })

    except Exception as e:
        print(f"Enrollment error: {e}", flush=True)
        return jsonify({"error": f"Enrollment failed: {str(e)}"}), 500
    finally:
        if os.path.exists(path):
            os.unlink(path)


@app.route("/api/analyze/upload", methods=["POST"])
def analyze_upload():
    officer_id = request.form.get("officer_id", "EO_001")
    f          = request.files.get("audio")
    if not f: return jsonify({"error": "No audio file uploaded"}), 400
    suffix = os.path.splitext(f.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        f.save(tmp.name)
        path = tmp.name
    try:
        print(f"Analyzing: {f.filename}", flush=True)
        audio, sr_ = librosa.load(path, sr=SR)
        return jsonify(run_analysis(audio, sr_, officer_id, source="upload", filename=f.filename))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(path):
            os.unlink(path)


@app.route("/api/analyze/sample", methods=["POST"])
def analyze_sample():
    data       = request.get_json() or {}
    filename   = data.get("filename", "")
    officer_id = data.get("officer_id", "EO_001")
    fpath      = os.path.join(SAMPLES, filename)
    if not os.path.exists(fpath):
        for d in [os.path.join(BASE, "challan_audio_samples"), BASE]:
            alt = os.path.join(d, filename)
            if os.path.exists(alt):
                fpath = alt
                break
    if not os.path.exists(fpath):
        return jsonify({"error": f"Not found: {filename}"}), 404
    print(f"Analyzing sample: {filename}", flush=True)
    audio, sr_ = librosa.load(fpath, sr=SR)
    return jsonify(run_analysis(audio, sr_, officer_id, source="sample", filename=filename))


@app.route("/api/samples")
def get_samples():
    if not os.path.exists(SAMPLES):
        return jsonify({"samples": []})
    files = sorted(f for f in os.listdir(SAMPLES) if f.endswith(".wav"))
    out   = []
    for fname in files:
        audio, sr_ = librosa.load(os.path.join(SAMPLES, fname), sr=SR)
        energy = float(np.sqrt(np.mean(audio ** 2)))
        exp    = "CRITICAL" if any(x in fname for x in ["harsh","threat","bribe","violation"]) else "NORMAL"
        out.append({
            "filename":          fname,
            "duration_sec":      round(len(audio) / sr_, 1),
            "energy":            round(energy, 4),
            "expected_severity": exp,
        })
    return jsonify({"samples": out})


@app.route("/api/keywords")
def get_keywords():
    return jsonify({
        "version":        CONFIG.get("version", "5.0"),
        "detection":      "Auto from voice via faster-whisper + Google Speech",
        "keywords":       {k: {
            "score":       v["score"],
            "severity":    v["severity"],
            "label":       v.get("label", k),
            "description": v.get("description", ""),
            "words":       v["words"],
            "count":       len(v["words"]),
        } for k, v in VK.items()},
        "total_keywords": sum(len(v["words"]) for v in VK.values()),
        "categories":     len(VK),
    })


@app.route("/api/incidents")
def get_incidents():
    page  = int(request.args.get("page",  1))
    limit = int(request.args.get("limit", 20))
    sev   = request.args.get("severity",  "")
    oid   = request.args.get("officer_id","")
    items = list(reversed(INCIDENTS))
    if sev: items = [i for i in items if i["severity"]   == sev]
    if oid: items = [i for i in items if i["officer_id"] == oid]
    total = len(items)
    start = (page - 1) * limit
    return jsonify({
        "incidents": items[start:start + limit],
        "total":     total,
        "page":      page,
        "pages":     max(1, (total + limit - 1) // limit),
    })


@app.route("/api/incidents/<incident_id>")
def get_incident(incident_id):
    for inc in INCIDENTS:
        if inc["incident_id"] == incident_id:
            return jsonify(inc)
    return jsonify({"error": "Not found"}), 404


@app.route("/api/dashboard/stats")
def dashboard_stats():
    total    = len(INCIDENTS)
    critical = sum(1 for i in INCIDENTS if i["severity"] == "CRITICAL")
    warning  = sum(1 for i in INCIDENTS if i["severity"] == "WARNING")
    normal   = sum(1 for i in INCIDENTS if i["severity"] == "NORMAL")
    avg_sc   = float(np.mean([i["total_score"] for i in INCIDENTS])) if INCIDENTS else 0
    vtype_counts = {}
    for inc in INCIDENTS:
        for v in inc.get("violations", []):
            vtype_counts[v["type"]] = vtype_counts.get(v["type"], 0) + 1

    # Behavior rating distribution
    behavior_dist = {}
    for inc in INCIDENTS:
        rating = inc.get("behavior_assessment", {}).get("overall_rating", "UNKNOWN")
        behavior_dist[rating] = behavior_dist.get(rating, 0) + 1

    return jsonify({
        "total_analyzed":       total,
        "critical":             critical,
        "warning":              warning,
        "normal":               normal,
        "avg_score":            round(avg_sc, 1),
        "violation_types":      sorted(vtype_counts.items(), key=lambda x: -x[1])[:10],
        "behavior_distribution": behavior_dist,
        "recent_incidents":     list(reversed(INCIDENTS[-10:])),
        "officers_enrolled":    sum(1 for o in OFFICERS.values() if o.get("enrolled")),
        "keyword_categories":   list(VK.keys()),
        "total_keywords":       sum(len(v["words"]) for v in VK.values()),
        "model_version":        CONFIG.get("version", "5.0"),
        "tone_cv_accuracy":     round(CONFIG.get("tone_classifier_cv_accuracy", 0) * 100, 1),
        "transcription":        "faster-whisper small" + (" + Google Speech" if True else ""),
        "severity_levels":      CONFIG.get("severity_levels", {}),
    })


@app.route("/api/livestream/chunk", methods=["POST"])
def livestream_chunk():
    officer_id  = request.form.get("officer_id",  "EO_001")
    session_id  = request.form.get("session_id",  "live_01")
    chunk_index = int(request.form.get("chunk_index", 0))
    f           = request.files.get("audio")
    if not f: return jsonify({"error": "No audio chunk"}), 400
    suffix = os.path.splitext(f.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        f.save(tmp.name)
        path = tmp.name
    try:
        audio, sr_ = librosa.load(path, sr=SR)
        result = run_analysis(audio, sr_, officer_id, source="livestream",
                              filename=f"chunk_{chunk_index:04d}")
        result["session_id"]  = session_id
        result["chunk_index"] = chunk_index
        socketio.emit("analysis_progress", {
            "session_id":  session_id,
            "chunk_index": chunk_index,
            "severity":    result["severity"],
            "total_score": result["total_score"],
            "eo_detected": result["eo_detected"],
            "violations":  len(result["violations"]),
            "behavior_rating": result.get("behavior_assessment", {}).get("overall_rating", ""),
        })
        return jsonify(result)
    finally:
        if os.path.exists(path):
            os.unlink(path)


@socketio.on("connect")
def on_connect():
    emit("connected", {"message": "EO Bodycam AI v5.0 ready — Complete Monitoring Active"})

@socketio.on("join_supervisor")
def on_join(data):
    emit("joined", {"role": "supervisor", "message": "Live alerts active — 10 violation categories monitored"})


# ═══════════════════════════════════════════════════════════════
#  SERVER STARTUP
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    kw_total = sum(len(v["words"]) for v in VK.values())
    ln = TONE_MODEL["label_names"]
    emotions = list(ln.values()) if isinstance(ln, dict) else list(ln)
    print(f"\n{'='*60}")
    print(f" EO Bodycam AI Server v5.0 — Complete Monitoring System")
    print(f"{'='*60}")
    groq_status = "ACTIVE" if os.environ.get("GROQ_API_KEY") else "NOT SET (set GROQ_API_KEY for best accuracy)"
    print(f" Groq API:      {groq_status}")
    print(f" Transcription: Groq whisper-large-v3 → local whisper-small → Google Speech")
    print(f" Emotions:      {' / '.join(emotions)}")
    print(f" Warning:       score >= {CONFIG['warning_score']}")
    print(f" Critical:      score >= {CONFIG['critical_score']}")
    print(f" Keywords:      {kw_total} Urdu words in {len(VK)} categories")
    print(f" Categories:    {', '.join(VK.keys())}")
    print(f"{'─'*60}")
    for cat, cfg in VK.items():
        ascii_words = [w for w in cfg['words'] if all(ord(c) < 256 for c in w)][:3]
        sample = ', '.join(ascii_words) if ascii_words else '...'
        print(f"   {cat} ({cfg['severity']}, +{cfg['score']}pts): {sample}...")
    print(f"{'─'*60}")
    print(f" Severity Levels:")
    for level, info in CONFIG.get("severity_levels", {}).items():
        print(f"   {level}: {info['min_score']}-{info['max_score']} pts -> {info['action']}")
    print(f"{'─'*60}")
    print(f" Tone detection: Acoustic-based (energy, pitch, agitation)")
    print(f" Enrolled pitch: {ENROLLED_PITCH:.1f}Hz")
    print(f" http://localhost:5050")
    print(f"{'='*60}\n")
    socketio.run(app, host="0.0.0.0", port=5050, debug=False,
                 allow_unsafe_werkzeug=True)
