"""
EO Bodycam AI — Backend API v3.4
Detects: NORMAL, HARSH, ANGRY, BRIBE_TONE emotions
Keywords: paisa, rishwat, jail, maar, gadha, chhod do + 110 more
Thresholds calibrated for real human voice (WhatsApp audio)
"""
import os, json, pickle, time, uuid, tempfile
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import numpy as np
import librosa

BASE    = os.path.dirname(os.path.abspath(__file__))
MODELS  = os.path.join(BASE, "models")
SAMPLES = os.path.join(BASE, "audio_samples")
UPLOADS = os.path.join(BASE, "uploads")
SR      = 16000
os.makedirs(UPLOADS, exist_ok=True)

app = Flask(__name__)
app.config["SECRET_KEY"] = "eo-bodycam-v34"
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

print("Loading AI models...", flush=True)
with open(f"{MODELS}/voiceprint_EO_001.pkl","rb") as f: ENROLLMENT=pickle.load(f)
with open(f"{MODELS}/tone_classifier.pkl","rb") as f:   TONE_MODEL=pickle.load(f)
with open(f"{MODELS}/model_config.json","r",encoding="utf-8") as f: CONFIG=json.load(f)

EO_VECTOR      = np.array(ENROLLMENT["voiceprint"]["vector"])
EO_THRESHOLD   = CONFIG["eo_similarity_threshold"]
ENROLLED_PITCH = ENROLLMENT["voiceprint"]["f0_mean"]
VK             = CONFIG["violation_keywords"]

WHISPER_MODEL = None
try:
    import whisper
    WHISPER_MODEL = whisper.load_model("tiny")
    print("Whisper tiny ready — Urdu auto-transcription active", flush=True)
except Exception as e:
    print(f"Whisper not available: {e}", flush=True)

kw_total = sum(len(v["words"]) for v in VK.values())
print(f"EO pitch={ENROLLED_PITCH:.1f}Hz  threshold={EO_THRESHOLD}", flush=True)
print(f"Emotions: NORMAL / HARSH / ANGRY / BRIBE_TONE", flush=True)
print(f"Thresholds: warning={CONFIG['warning_score']} critical={CONFIG['critical_score']}", flush=True)
print(f"Keywords: {kw_total} Urdu words in {len(VK)} categories", flush=True)

OFFICERS = {
    "EO_001":{"name":"Ali Hassan",   "badge":"PK-LHR-001","enrolled":True, "area":"Lahore - Anarkali"},
    "EO_002":{"name":"Umar Farooq",  "badge":"PK-LHR-002","enrolled":False,"area":"Lahore - Model Town"},
    "EO_003":{"name":"Fatima Malik", "badge":"PK-KHI-001","enrolled":False,"area":"Karachi - Saddar"},
}
INCIDENTS = []


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


def auto_transcribe(audio, sr=SR):
    if WHISPER_MODEL is None:
        return "", "whisper_not_installed"
    try:
        import soundfile as sf
        audio_clip = audio[:sr * 30] if len(audio) > sr * 30 else audio
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            sf.write(f.name, audio_clip.astype(np.float32), sr)
            tmp = f.name
        result = WHISPER_MODEL.transcribe(
            tmp, language="ur", task="transcribe",
            verbose=False, word_timestamps=False,
            condition_on_previous_text=False,
            fp16=False, temperature=0, best_of=1, beam_size=1,
        )
        os.unlink(tmp)
        text = result.get("text", "").strip()
        print(f"  Transcribed: '{text[:100]}'", flush=True)
        return text, "whisper_tiny"
    except Exception as e:
        print(f"  Transcription error: {e}", flush=True)
        return "", "error"


def detect_keywords(transcript):
    if not transcript:
        return 0, []
    text  = transcript.lower().strip()
    score = 0
    viols = []
    for vtype, cfg in VK.items():
        hits = [w for w in cfg["words"] if w in text]
        if hits:
            pts = cfg["score"]
            score += pts
            viols.append({
                "type":           vtype,
                "severity":       cfg["severity"],
                "score":          pts,
                "label":          cfg.get("label", vtype),
                "detail":         f"Spoken words detected: {', '.join(hits)}",
                "keywords_found": hits,
                "source":         "voice_transcription",
            })
    return min(score, 50), viols


def analyze_tone(eo_audio, sr):
    tone_label = "UNKNOWN"
    tone_proba = {}
    acoustics  = {
        "avg_energy": 0.0, "avg_pitch_hz": 0.0,
        "zcr": 0.0, "pitch_variance": 0.0,
        "loud_duration_sec": 0.0, "agitation": 0.0,
        "enrolled_pitch_hz": ENROLLED_PITCH, "pitch_ratio": 0.0,
    }
    tone_score = 0
    tone_viols = []

    if len(eo_audio) < sr * 0.3:
        return tone_label, tone_proba, acoustics, tone_score, tone_viols

    mid   = len(eo_audio) // 2
    chunk = eo_audio[max(0, mid - sr):min(len(eo_audio), mid + sr)]
    vec   = extract_features(chunk, sr)
    pred  = TONE_MODEL["model"].predict([vec])[0]
    prob  = TONE_MODEL["model"].predict_proba([vec])[0]
    tone_label = TONE_MODEL["label_names"][int(pred)]
    tone_proba = {
        TONE_MODEL["label_names"][i]: round(float(p), 3)
        for i, p in enumerate(prob)
    }

    rms_energy = float(np.sqrt(np.mean(eo_audio ** 2)))
    rms_frames = librosa.feature.rms(y=eo_audio)[0]
    zcr_val    = float(np.mean(librosa.feature.zero_crossing_rate(y=eo_audio)))

    try:
        f0, vf, _ = librosa.pyin(eo_audio, sr=sr, fmin=65, fmax=500)
        fv        = f0[vf] if vf is not None else np.array([])
        avg_pitch = float(np.mean(fv)) if len(fv) > 0 else 0.0
        pitch_var = float(np.std(fv))  if len(fv) > 0 else 0.0
    except:
        avg_pitch, pitch_var = 0.0, 0.0

    mfcc_delta    = librosa.feature.delta(librosa.feature.mfcc(y=eo_audio, sr=sr, n_mfcc=13))
    agitation     = float(np.mean(np.abs(mfcc_delta)))
    loud_frames   = np.sum(rms_frames > CONFIG["loud_frame_energy"])
    loud_duration = float(loud_frames * 512 / sr)
    ratio         = avg_pitch / ENROLLED_PITCH if ENROLLED_PITCH > 0 else 0

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

    if rms_energy > CONFIG["energy_normal_max"]:
        tone_score += flag("ELEVATED_VOICE", "MEDIUM",
            CONFIG["score_elevated_voice"],
            f"Raised voice — energy {rms_energy:.4f}")

    if rms_energy > CONFIG["energy_shouting_min"]:
        tone_score += flag("SHOUTING", "HIGH",
            CONFIG["score_shouting"],
            f"Shouting detected — energy {rms_energy:.4f}")

    if ratio > CONFIG["pitch_high_ratio"] and avg_pitch > 0:
        tone_score += flag("HIGH_PITCH", "MEDIUM",
            CONFIG["score_high_pitch"],
            f"Angry pitch {avg_pitch:.0f}Hz = {ratio:.2f}x above {ENROLLED_PITCH:.0f}Hz")

    if ratio > CONFIG["pitch_extreme_ratio"] and avg_pitch > 0:
        tone_score += flag("EXTREME_PITCH", "HIGH",
            CONFIG["score_extreme_pitch"],
            f"Extreme anger — pitch {avg_pitch:.0f}Hz ({ratio:.2f}x baseline)")

    if loud_duration > CONFIG["loud_duration_sec"]:
        tone_score += flag("PROLONGED_SHOUTING", "HIGH",
            CONFIG["score_prolonged_loud"],
            f"Sustained loud speech {loud_duration:.1f}s")

    if agitation > CONFIG["agitation_threshold"]:
        tone_score += flag("AGITATED_SPEECH", "MEDIUM",
            CONFIG["score_agitation"],
            f"Agitated speech — index {agitation:.3f}")

    conf_thresh = CONFIG.get("emotion_confidence_threshold", 0.60)
    if tone_label == "HARSH" and tone_proba.get("HARSH", 0) >= conf_thresh:
        tone_score += flag("EMOTION_HARSH", "HIGH", 15,
            f"AI detected HARSH ({tone_proba.get('HARSH',0):.0%} confidence) — aggressive speech")
    elif tone_label == "ANGRY" and tone_proba.get("ANGRY", 0) >= conf_thresh:
        tone_score += flag("EMOTION_ANGRY", "HIGH", 15,
            f"AI detected ANGRY ({tone_proba.get('ANGRY',0):.0%} confidence) — threatening speech")
    elif tone_label == "BRIBE_TONE" and tone_proba.get("BRIBE_TONE", 0) >= conf_thresh:
        tone_score += flag("EMOTION_BRIBE", "HIGH", 20,
            f"AI detected BRIBE_TONE ({tone_proba.get('BRIBE_TONE',0):.0%} confidence)")

    return tone_label, tone_proba, acoustics, min(tone_score, 50), tone_viols


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

    print(f"  Score:{total_score} tone={tone_score} kw={kw_score} → {severity}", flush=True)
    print(f"  Emotion:{tone_label} Violations:{len(all_viols)}", flush=True)

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
        "alert_required":       severity != "NORMAL",
        "processing_time_sec":  round(time.time() - t0, 2),
    }

    INCIDENTS.append(result)

    if severity in ("CRITICAL", "WARNING"):
        socketio.emit("violation_alert", {
            "incident_id":    incident_id,
            "officer_id":     officer_id,
            "officer_name":   result["officer_name"],
            "severity":       severity,
            "total_score":    total_score,
            "tone_score":     tone_score,
            "keyword_score":  kw_score,
            "tone_label":     tone_label,
            "violations":     all_viols,
            "timestamp":      result["timestamp"],
            "filename":       filename,
            "keywords_found": [kw for v in kw_viols for kw in v.get("keywords_found", [])],
        })

    return result


@app.route("/api/health")
def health():
    return jsonify({
        "status":             "healthy",
        "version":            "3.4",
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
        "version":        CONFIG.get("version", "3.4"),
        "detection":      "Auto from voice via Whisper AI",
        "keywords":       {k: {
            "score":    v["score"],
            "severity": v["severity"],
            "label":    v.get("label", k),
            "words":    v["words"],
            "count":    len(v["words"]),
        } for k, v in VK.items()},
        "total_keywords": sum(len(v["words"]) for v in VK.values()),
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
    return jsonify({
        "total_analyzed":    total,
        "critical":          critical,
        "warning":           warning,
        "normal":            normal,
        "avg_score":         round(avg_sc, 1),
        "violation_types":   sorted(vtype_counts.items(), key=lambda x: -x[1])[:10],
        "recent_incidents":  list(reversed(INCIDENTS[-10:])),
        "officers_enrolled": sum(1 for o in OFFICERS.values() if o.get("enrolled")),
        "keyword_categories":list(VK.keys()),
        "model_version":     "3.4",
        "tone_cv_accuracy":  round(CONFIG.get("tone_classifier_cv_accuracy", 0) * 100, 1),
        "whisper_available": WHISPER_MODEL is not None,
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
        })
        return jsonify(result)
    finally:
        if os.path.exists(path):
            os.unlink(path)


@socketio.on("connect")
def on_connect():
    emit("connected", {"message": "EO Bodycam AI v3.4 ready"})

@socketio.on("join_supervisor")
def on_join(data):
    emit("joined", {"role": "supervisor", "message": "Live alerts active"})


if __name__ == "__main__":
    kw_total = sum(len(v["words"]) for v in VK.values())
    ln = TONE_MODEL["label_names"]
    emotions = list(ln.values()) if isinstance(ln, dict) else list(ln)
    print(f"\n{'='*55}")
    print(f" EO Bodycam AI Server v3.4")
    print(f" Emotions: {' / '.join(emotions)}")
    print(f" Whisper:  {'tiny model active' if WHISPER_MODEL else 'pip install openai-whisper'}")
    print(f" Warning:  score >= {CONFIG['warning_score']}")
    print(f" Critical: score >= {CONFIG['critical_score']}")
    print(f" Keywords: {kw_total} Urdu words in {len(VK)} categories")
    print(f"   RISHWAT:    paisa, paisay, rishwat, chhod do...")
    print(f"   DHAMKI:     arrest kar, jail, maar, thana...")
    print(f"   GALI:       gadha, bewaqoof, chup kar...")
    print(f"   RUDE:       chup raho, nikal jao, chalte bano...")
    print(f"   HARASSMENT: akela pakad loon ga, naukri jayegi...")
    print(f" SVM accuracy: {CONFIG.get('tone_classifier_cv_accuracy',0)*100:.1f}%")
    print(f" Enrolled pitch: {ENROLLED_PITCH:.1f}Hz")
    print(f" http://localhost:5050")
    print(f"{'='*55}\n")
    socketio.run(app, host="0.0.0.0", port=5050, debug=False,
                 allow_unsafe_werkzeug=True)