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


def _detect_hallucination(text):
    """Detect Whisper hallucination — repeating phrases."""
    if not text or len(text) < 10:
        return True
    words = text.split()
    if len(words) < 3:
        return False
    for i in range(len(words) - 5):
        phrase = words[i] + " " + words[i+1]
        count = sum(1 for j in range(i, len(words) - 1) if words[j] + " " + words[j+1] == phrase)
        if count >= 3:
            return True
    from collections import Counter
    counts = Counter(words)
    for word, cnt in counts.most_common(3):
        if cnt >= 4 and cnt / len(words) > 0.3 and len(word) > 1:
            return True
    return False


def _clean_hallucination(text):
    """Remove repeated phrases, keep first occurrence."""
    if not text:
        return text
    words = text.split()
    if len(words) < 6:
        return text
    seen = {}
    for i in range(len(words) - 1):
        bigram = words[i] + " " + words[i+1]
        if bigram in seen and i - seen[bigram] < 5:
            return " ".join(words[:seen[bigram] + 2])
        seen[bigram] = i
    return text


def _google_transcribe_chunk(audio_data, language):
    """Transcribe a single chunk via Google Speech."""
    try:
        text = RECOGNIZER.recognize_google(audio_data, language=language)
        if text and text.strip():
            return text.strip()
    except (sr_lib.UnknownValueError, sr_lib.RequestError):
        pass
    return ""


def _groq_transcribe(audio_path):
    """Transcribe via Groq API with hallucination protection."""
    import requests
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        return "", ""

    headers = {"Authorization": f"Bearer {groq_key}"}
    urdu_text = ""
    english_text = ""

    urdu_prompt = (
        "یار میں شالیمار اسٹیشن سے آیا ہوں۔ ریٹ لسٹ لگائی ہے۔ "
        "بکواس بند کرو، چپ رہو، تمیز سے بات کرو۔ "
        "پیسے دے دو، چالان، گرفتار، رشوت۔"
    )

    # 1. Urdu transcription
    try:
        with open(audio_path, "rb") as f:
            resp = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers,
                files={"file": ("audio.wav", f, "audio/wav")},
                data={
                    "model": "whisper-large-v3-turbo",
                    "language": "ur",
                    "response_format": "text",
                    "prompt": urdu_prompt,
                    "temperature": "0.0",
                },
                timeout=30,
            )
        if resp.status_code == 200 and resp.text.strip():
            raw = resp.text.strip()
            if _detect_hallucination(raw):
                print(f"  [groq-ur] hallucination detected, cleaning", flush=True)
                raw = _clean_hallucination(raw)
            urdu_text = raw
            print(f"  [groq-ur] {urdu_text[:200]}", flush=True)
        else:
            print(f"  Groq Urdu error {resp.status_code}: {resp.text[:100]}", flush=True)
    except Exception as e:
        print(f"  Groq Urdu error: {e}", flush=True)

    # 2. English translation
    try:
        with open(audio_path, "rb") as f:
            resp = requests.post(
                "https://api.groq.com/openai/v1/audio/translations",
                headers=headers,
                files={"file": ("audio.wav", f, "audio/wav")},
                data={
                    "model": "whisper-large-v3-turbo",
                    "response_format": "text",
                    "temperature": "0.0",
                },
                timeout=30,
            )
        if resp.status_code == 200 and resp.text.strip():
            en = resp.text.strip()
            if not _detect_hallucination(en):
                english_text = en
                print(f"  [groq-en] {english_text[:200]}", flush=True)
        else:
            print(f"  Groq English error {resp.status_code}: {resp.text[:100]}", flush=True)
    except Exception as e:
        print(f"  Groq English error: {e}", flush=True)

    return urdu_text, english_text


def auto_transcribe(audio, sample_rate=SR):
    """Transcribe FULL audio — splits into 25s chunks for complete coverage.

    Pipeline:
      1. Google Speech ur-PK in 25s chunks (primary — no hallucination, full audio)
      2. Groq whisper-large-v3-turbo (English translation for keyword matching)
      3. Local whisper small (last fallback)
    """
    import soundfile as sf

    total_duration = len(audio) / sample_rate
    print(f"  Audio: {total_duration:.1f}s", flush=True)

    # Normalize volume
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak * 0.95

    # ═══════════════════════════════════════════════════════════
    #  1. GOOGLE SPEECH — split into 25s chunks for full audio coverage
    # ═══════════════════════════════════════════════════════════
    chunk_sec = 25
    chunk_size = sample_rate * chunk_sec
    chunks = []
    for i in range(0, len(audio), chunk_size):
        chunk = audio[i:i + chunk_size]
        if len(chunk) > sample_rate * 0.5:
            chunks.append(chunk)

    print(f"  Split: {len(chunks)} chunks ({chunk_sec}s each)", flush=True)

    urdu_parts = []
    method = "none"

    for ci, chunk in enumerate(chunks):
        tmp_chunk = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                sf.write(f.name, chunk.astype(np.float32), sample_rate)
                tmp_chunk = f.name
        except Exception:
            continue

        chunk_text = ""
        try:
            with sr_lib.AudioFile(tmp_chunk) as source:
                audio_data = RECOGNIZER.record(source)

            # Try Urdu
            chunk_text = _google_transcribe_chunk(audio_data, "ur-PK")
            if chunk_text:
                method = "google_speech"
                print(f"  [chunk {ci+1}/{len(chunks)} ur] {chunk_text[:100]}", flush=True)

            # Try Punjabi if Urdu failed
            if not chunk_text:
                chunk_text = _google_transcribe_chunk(audio_data, "pa-IN")
                if chunk_text:
                    method = "google_speech"
                    print(f"  [chunk {ci+1}/{len(chunks)} pa] {chunk_text[:100]}", flush=True)

            # Try English if both failed
            if not chunk_text:
                chunk_text = _google_transcribe_chunk(audio_data, "en-PK")
                if chunk_text:
                    method = "google_speech"
                    print(f"  [chunk {ci+1}/{len(chunks)} en] {chunk_text[:100]}", flush=True)
        except Exception as e:
            print(f"  [chunk {ci+1}] error: {e}", flush=True)
        finally:
            try:
                os.unlink(tmp_chunk)
            except:
                pass

        if chunk_text:
            urdu_parts.append(chunk_text)

    urdu_transcript = " ".join(urdu_parts)

    # ═══════════════════════════════════════════════════════════
    #  2. GROQ — English translation for keyword matching
    # ═══════════════════════════════════════════════════════════
    english_extra = ""
    tmp_full = None
    try:
        full_clip = audio[:sample_rate * 120]
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            sf.write(f.name, full_clip.astype(np.float32), sample_rate)
            tmp_full = f.name
    except Exception:
        pass

    if tmp_full:
        groq_ur, groq_en = _groq_transcribe(tmp_full)
        if not urdu_transcript and groq_ur:
            urdu_transcript = groq_ur
            method = "groq_whisper"
        if groq_en:
            english_extra = groq_en
        try:
            os.unlink(tmp_full)
        except:
            pass

    # ═══════════════════════════════════════════════════════════
    #  3. LOCAL WHISPER — last fallback
    # ═══════════════════════════════════════════════════════════
    if not urdu_transcript and WHISPER_MODEL is not None:
        try:
            tmp_wb = None
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                sf.write(f.name, audio[:sample_rate * 60].astype(np.float32), sample_rate)
                tmp_wb = f.name
            segments, info = WHISPER_MODEL.transcribe(
                tmp_wb, language="ur", task="transcribe",
                beam_size=3, best_of=1, temperature=0.0,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=300, speech_pad_ms=200),
            )
            whisper_text = " ".join(seg.text.strip() for seg in segments).strip()
            if whisper_text:
                if _detect_hallucination(whisper_text):
                    whisper_text = _clean_hallucination(whisper_text)
                if whisper_text:
                    urdu_transcript = whisper_text
                    method = "whisper_local"
                    print(f"  [whisper-local] {whisper_text[:200]}", flush=True)
            try:
                os.unlink(tmp_wb)
            except:
                pass
        except Exception as e:
            print(f"  whisper-local error: {e}", flush=True)

    if not urdu_transcript:
        print("  No transcript from any engine", flush=True)
        return "", "no_speech_detected"

    # Single clean output: Urdu (displayed) + English (hidden, keywords only)
    transcript = urdu_transcript + (" | " + english_extra if english_extra else "")
    print(f"  Final [{method}]: {urdu_transcript[:200]}", flush=True)

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
    """Acoustic-based tone analysis using RAW audio energy (no normalization).

    The key insight: we must NOT normalize volume before measuring energy,
    because normalization makes whispers and shouts look identical.
    We use raw RMS for loudness, but normalized audio for pitch extraction only.
    """
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

    # ── RAW energy (DO NOT normalize — this measures actual loudness) ──
    raw_rms = float(np.sqrt(np.mean(eo_audio ** 2)))
    raw_rms_frames = librosa.feature.rms(y=eo_audio)[0]
    zcr_val = float(np.mean(librosa.feature.zero_crossing_rate(y=eo_audio)))

    # ── Normalized audio ONLY for pitch extraction (pitch needs clean signal) ──
    peak = np.max(np.abs(eo_audio))
    norm_audio = eo_audio / peak * 0.9 if peak > 0.01 else eo_audio

    try:
        f0, vf, _ = librosa.pyin(norm_audio, sr=sr, fmin=65, fmax=500)
        fv        = f0[vf] if vf is not None else np.array([])
        avg_pitch = float(np.mean(fv)) if len(fv) > 0 else 0.0
        pitch_var = float(np.std(fv))  if len(fv) > 0 else 0.0
    except:
        avg_pitch, pitch_var = 0.0, 0.0

    mfcc_delta = librosa.feature.delta(librosa.feature.mfcc(y=norm_audio, sr=sr, n_mfcc=13))
    agitation  = float(np.mean(np.abs(mfcc_delta)))

    # ── Dynamic loudness analysis (compares loud vs quiet parts within clip) ──
    rms_sorted = np.sort(raw_rms_frames)
    n_frames = len(rms_sorted)
    if n_frames > 10:
        quiet_avg = float(np.mean(rms_sorted[:n_frames//4]))
        loud_avg  = float(np.mean(rms_sorted[-n_frames//4:]))
        loudness_ratio = loud_avg / (quiet_avg + 1e-6)
        # Percentile-based loudness (more robust than mean)
        p90_energy = float(np.percentile(raw_rms_frames, 90))
        p50_energy = float(np.percentile(raw_rms_frames, 50))
    else:
        loudness_ratio = 1.0
        p90_energy = raw_rms
        p50_energy = raw_rms

    # Count frames above different thresholds
    loud_frames     = np.sum(raw_rms_frames > 0.08)
    shouting_frames = np.sum(raw_rms_frames > 0.15)
    loud_duration   = float(loud_frames * 512 / sr)
    shout_duration  = float(shouting_frames * 512 / sr)
    ratio           = avg_pitch / ENROLLED_PITCH if ENROLLED_PITCH > 0 else 0

    # Spectral features for harsh vs soft detection
    spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=eo_audio, sr=sr)))
    spectral_rolloff  = float(np.mean(librosa.feature.spectral_rolloff(y=eo_audio, sr=sr)))

    print(f"  Tone: raw_rms={raw_rms:.4f} p90={p90_energy:.4f} p50={p50_energy:.4f} "
          f"pitch={avg_pitch:.0f}Hz ratio={ratio:.2f} pitch_var={pitch_var:.1f} "
          f"agitation={agitation:.3f} loudness_ratio={loudness_ratio:.1f} "
          f"loud_dur={loud_duration:.1f}s shout_dur={shout_duration:.1f}s "
          f"centroid={spectral_centroid:.0f} zcr={zcr_val:.4f}", flush=True)

    acoustics = {
        "avg_energy":        round(raw_rms, 4),
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

    # ═══════════════════════════════════════════════════════════
    #  SCORING — based on raw energy, not normalized
    # ═══════════════════════════════════════════════════════════

    # 1. Overall loudness (raw RMS — louder voice = higher score)
    if raw_rms > 0.15:
        tone_score += flag("SHOUTING", "CRITICAL", 20,
            f"Shouting detected — very loud voice (energy {raw_rms:.3f})")
    elif raw_rms > 0.08:
        tone_score += flag("LOUD_VOICE", "HIGH", 12,
            f"Loud/raised voice detected (energy {raw_rms:.3f})")
    elif raw_rms > 0.04:
        tone_score += flag("ELEVATED_VOICE", "MEDIUM", 5,
            f"Slightly raised voice (energy {raw_rms:.3f})")

    # 2. Peak loudness (p90 — catches bursts of shouting even in otherwise calm audio)
    if p90_energy > 0.20:
        tone_score += flag("BURST_SHOUTING", "HIGH", 10,
            f"Bursts of shouting detected (peak energy {p90_energy:.3f})")

    # 3. Pitch analysis
    if ratio > 1.6 and avg_pitch > 0:
        tone_score += flag("EXTREME_PITCH", "HIGH", 12,
            f"Extreme high pitch {avg_pitch:.0f}Hz — {ratio:.1f}x above baseline {ENROLLED_PITCH:.0f}Hz")
    elif ratio > 1.3 and avg_pitch > 0:
        tone_score += flag("HIGH_PITCH", "MEDIUM", 7,
            f"Raised pitch {avg_pitch:.0f}Hz — {ratio:.1f}x above baseline {ENROLLED_PITCH:.0f}Hz")

    # 4. Pitch instability (angry/emotional speech has high variance)
    if pitch_var > 50:
        tone_score += flag("PITCH_UNSTABLE", "HIGH", 8,
            f"Very unstable pitch (variance {pitch_var:.0f}Hz) — angry/emotional speech")
    elif pitch_var > 30:
        tone_score += flag("PITCH_UNSTABLE", "MEDIUM", 4,
            f"Unstable pitch (variance {pitch_var:.0f}Hz)")

    # 5. Sustained loud speech (duration matters)
    if shout_duration > 3.0:
        tone_score += flag("PROLONGED_SHOUTING", "CRITICAL", 15,
            f"Sustained shouting for {shout_duration:.1f}s")
    elif loud_duration > 2.0:
        tone_score += flag("PROLONGED_LOUD", "HIGH", 8,
            f"Sustained loud speech for {loud_duration:.1f}s")

    # 6. Agitation (rapid MFCC changes = emotional/aggressive speech)
    if agitation > 2.5:
        tone_score += flag("HIGH_AGITATION", "HIGH", 10,
            f"Highly agitated speech (index {agitation:.2f})")
    elif agitation > 1.5:
        tone_score += flag("AGITATED_SPEECH", "MEDIUM", 5,
            f"Agitated speech (index {agitation:.2f})")

    # 7. Dynamic range (voice raised vs calm parts within same clip)
    if loudness_ratio > 6.0:
        tone_score += flag("VOICE_EXPLOSION", "HIGH", 10,
            f"Voice raised {loudness_ratio:.0f}x louder than calm parts — sudden anger")
    elif loudness_ratio > 3.0:
        tone_score += flag("VOICE_RAISED", "MEDIUM", 5,
            f"Voice raised {loudness_ratio:.0f}x louder than calm parts")

    # 8. Harsh spectral quality (high spectral centroid = harsh/aggressive tone)
    if spectral_centroid > 2500 and raw_rms > 0.06:
        tone_score += flag("HARSH_TONE", "MEDIUM", 5,
            f"Harsh vocal quality detected (spectral centroid {spectral_centroid:.0f}Hz)")

    # ═══════════════════════════════════════════════════════════
    #  TONE LABEL — weighted combination of all signals
    # ═══════════════════════════════════════════════════════════
    anger_score = 0.0
    harsh_score = 0.0
    bribe_score = 0.0

    # Anger signals
    if raw_rms > 0.15: anger_score += 0.30
    elif raw_rms > 0.08: anger_score += 0.15
    if ratio > 1.6 and avg_pitch > 0: anger_score += 0.20
    elif ratio > 1.3 and avg_pitch > 0: anger_score += 0.10
    if pitch_var > 50: anger_score += 0.15
    if shout_duration > 3.0: anger_score += 0.20
    elif loud_duration > 2.0: anger_score += 0.10
    if agitation > 2.5: anger_score += 0.15
    elif agitation > 1.5: anger_score += 0.08
    if loudness_ratio > 6.0: anger_score += 0.15

    # Harsh signals (moderate aggression)
    if raw_rms > 0.04: harsh_score += 0.15
    if ratio > 1.2 and avg_pitch > 0: harsh_score += 0.15
    if pitch_var > 20: harsh_score += 0.10
    if loud_duration > 1.0: harsh_score += 0.10
    if agitation > 1.0: harsh_score += 0.10
    if spectral_centroid > 2000: harsh_score += 0.10
    if loudness_ratio > 2.5: harsh_score += 0.10

    # Bribe signals (quiet, low, conspiratorial)
    if raw_rms < 0.025: bribe_score += 0.25
    if ratio < 0.85 and avg_pitch > 0: bribe_score += 0.20
    if pitch_var < 15 and avg_pitch > 0: bribe_score += 0.15
    if agitation < 0.5: bribe_score += 0.15
    if loudness_ratio < 1.5: bribe_score += 0.10

    # Determine label from scores
    if anger_score >= 0.45:
        tone_label = "ANGRY"
        n = round(max(0.02, 1.0 - anger_score - harsh_score * 0.3), 3)
        tone_proba = {"NORMAL": n, "HARSH": round(harsh_score * 0.5, 3),
                      "ANGRY": round(min(0.95, anger_score), 3), "BRIBE_TONE": 0.02}
    elif harsh_score >= 0.35:
        tone_label = "HARSH"
        n = round(max(0.05, 1.0 - harsh_score - anger_score * 0.3), 3)
        tone_proba = {"NORMAL": n, "HARSH": round(min(0.90, harsh_score), 3),
                      "ANGRY": round(anger_score * 0.5, 3), "BRIBE_TONE": 0.03}
    elif bribe_score >= 0.40:
        tone_label = "BRIBE_TONE"
        tone_proba = {"NORMAL": round(max(0.10, 1.0 - bribe_score), 3), "HARSH": 0.03,
                      "ANGRY": 0.02, "BRIBE_TONE": round(min(0.85, bribe_score), 3)}
    else:
        tone_label = "NORMAL"
        # Even NORMAL gets proportional probabilities
        total_bad = anger_score + harsh_score + bribe_score
        n = round(max(0.50, min(0.98, 1.0 - total_bad * 0.6)), 3)
        tone_proba = {"NORMAL": n,
                      "HARSH": round(harsh_score * 0.4, 3),
                      "ANGRY": round(anger_score * 0.3, 3),
                      "BRIBE_TONE": round(bribe_score * 0.3, 3)}

    print(f"  Tone result: label={tone_label} score={tone_score} "
          f"anger={anger_score:.2f} harsh={harsh_score:.2f} bribe={bribe_score:.2f}", flush=True)

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
