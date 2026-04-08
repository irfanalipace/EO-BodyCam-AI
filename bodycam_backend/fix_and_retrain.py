"""
Fix voiceprint pitch + retrain tone classifier with correct thresholds.
Fixes: normal audio being falsely classified as HARSH/CRITICAL
"""
import os, json, pickle, warnings
import numpy as np
import librosa
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report
from datetime import datetime, date

warnings.filterwarnings("ignore")

BASE    = os.path.dirname(os.path.abspath(__file__))
MODELS  = os.path.join(BASE, "models")
SAMPLES = os.path.join(BASE, "audio_samples")
SR      = 16000

LABEL_NAMES = ["NORMAL", "HARSH", "ANGRY", "BRIBE_TONE"]
LABEL_MAP   = {n: i for i, n in enumerate(LABEL_NAMES)}

AUDIO_LABELS = {
    "eo_normal.wav":           "NORMAL",
    "eo_harsh.wav":            "HARSH",
    "eo_bribe.wav":            "BRIBE_TONE",
    "eo_threat.wav":           "ANGRY",
    "enrollment_eo.wav":       "NORMAL",
    "customer_voice.wav":      "NORMAL",
    "shopkeeper_voice.wav":    "NORMAL",
    "market_scene_normal.wav": "NORMAL",
    "market_scene_harsh.wav":  "HARSH",
    "market_scene_bribe.wav":  "BRIBE_TONE",
    "market_scene_no_eo.wav":  "NORMAL",
}


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


# =====================================================================
# STEP 1: Fix voiceprint with correct pitch
# =====================================================================
def fix_voiceprint():
    print("=" * 55)
    print("STEP 1: Fixing voiceprint EO_001 pitch")
    print("=" * 55)

    pkl_path = os.path.join(MODELS, "voiceprint_EO_001.pkl")
    with open(pkl_path, "rb") as f:
        enrollment = pickle.load(f)

    old_pitch = enrollment["voiceprint"]["f0_mean"]
    print(f"  Old f0_mean in pkl: {old_pitch:.1f} Hz (WRONG - too high!)")

    # Re-extract pitch from enrollment audio with correct fmax=500
    audio, sr = librosa.load(os.path.join(SAMPLES, "enrollment_eo.wav"), sr=SR)
    f0, vf, _ = librosa.pyin(audio, sr=sr, fmin=65, fmax=500)
    fv = f0[vf] if vf is not None else np.array([])

    if len(fv) > 0:
        new_pitch = float(np.mean(fv))
        new_std   = float(np.std(fv))
    else:
        new_pitch = 143.4  # fallback from JSON
        new_std   = 15.5

    print(f"  New f0_mean: {new_pitch:.1f} Hz (correct human range)")
    print(f"  New f0_std:  {new_std:.1f} Hz")

    # Also re-extract the full vector with corrected fmax
    new_vector = extract_features(audio, sr)

    enrollment["voiceprint"]["f0_mean"] = new_pitch
    enrollment["voiceprint"]["f0_std"]  = new_std
    enrollment["voiceprint"]["vector"]  = new_vector.tolist()

    with open(pkl_path, "wb") as f:
        pickle.dump(enrollment, f)

    # Update JSON too
    json_path = os.path.join(MODELS, "voiceprint_EO_001.json")
    with open(json_path, "r", encoding="utf-8") as f:
        jdata = json.load(f)
    jdata["voiceprint_preview"]["f0_mean"] = new_pitch
    jdata["voiceprint_preview"]["f0_std"]  = new_std
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(jdata, f, indent=2, ensure_ascii=False)

    print(f"  Saved voiceprint with corrected pitch\n")
    return new_pitch


# =====================================================================
# STEP 2: Retrain tone classifier
# =====================================================================
def augment_audio(audio, sr, label):
    """Generate augmented versions. More conservative for NORMAL to avoid false positives."""
    augmented = []

    if label == "NORMAL":
        # Gentle augmentations only - keep normal sounding normal
        augmented.append(("noise_light", audio + np.random.randn(len(audio)) * 0.002))
        augmented.append(("noise_med", audio + np.random.randn(len(audio)) * 0.004))
        augmented.append(("quiet", audio * 0.5))
        augmented.append(("slightly_loud", np.clip(audio * 1.3, -1, 1)))
        augmented.append(("pitch_down1", librosa.effects.pitch_shift(audio, sr=sr, n_steps=-1)))
        augmented.append(("pitch_up1", librosa.effects.pitch_shift(audio, sr=sr, n_steps=1)))
        augmented.append(("slow", librosa.effects.time_stretch(audio, rate=0.92)))
        augmented.append(("fast", librosa.effects.time_stretch(audio, rate=1.08)))

    elif label == "HARSH":
        # Harsh = louder, faster, higher pitch, noisy
        augmented.append(("loud", np.clip(audio * 2.0, -1, 1)))
        augmented.append(("very_loud", np.clip(audio * 2.5, -1, 1)))
        augmented.append(("pitch_up2", librosa.effects.pitch_shift(audio, sr=sr, n_steps=2)))
        augmented.append(("pitch_up3", librosa.effects.pitch_shift(audio, sr=sr, n_steps=3)))
        augmented.append(("fast", librosa.effects.time_stretch(audio, rate=1.15)))
        augmented.append(("noise_harsh", audio + np.random.randn(len(audio)) * 0.01))
        augmented.append(("combo1", np.clip(librosa.effects.pitch_shift(audio, sr=sr, n_steps=2) * 1.8, -1, 1)))
        augmented.append(("combo2", np.clip(librosa.effects.time_stretch(audio, rate=1.1) * 1.5 + np.random.randn(len(librosa.effects.time_stretch(audio, rate=1.1))) * 0.008, -1, 1)))
        augmented.append(("extreme_loud", np.clip(audio * 3.0, -1, 1)))

    elif label == "ANGRY":
        # Angry = very loud, very high pitch, fast, aggressive
        augmented.append(("loud", np.clip(audio * 2.5, -1, 1)))
        augmented.append(("very_loud", np.clip(audio * 3.0, -1, 1)))
        augmented.append(("pitch_up3", librosa.effects.pitch_shift(audio, sr=sr, n_steps=3)))
        augmented.append(("pitch_up4", librosa.effects.pitch_shift(audio, sr=sr, n_steps=4)))
        augmented.append(("pitch_up5", librosa.effects.pitch_shift(audio, sr=sr, n_steps=5)))
        augmented.append(("fast", librosa.effects.time_stretch(audio, rate=1.2)))
        augmented.append(("very_fast", librosa.effects.time_stretch(audio, rate=1.3)))
        augmented.append(("combo_angry", np.clip(librosa.effects.pitch_shift(audio, sr=sr, n_steps=4) * 2.5, -1, 1)))
        augmented.append(("angry_fast_loud", np.clip(librosa.effects.time_stretch(audio, rate=1.2) * 2.0, -1, 1)))
        augmented.append(("angry_noise", np.clip(audio * 2.5 + np.random.randn(len(audio)) * 0.012, -1, 1)))
        augmented.append(("extreme", np.clip(librosa.effects.pitch_shift(audio, sr=sr, n_steps=5) * 3.0, -1, 1)))

    elif label == "BRIBE_TONE":
        # Bribe = quieter, slower, lower pitch (secretive/whispering)
        augmented.append(("quiet", audio * 0.4))
        augmented.append(("very_quiet", audio * 0.25))
        augmented.append(("pitch_down1", librosa.effects.pitch_shift(audio, sr=sr, n_steps=-1)))
        augmented.append(("pitch_down2", librosa.effects.pitch_shift(audio, sr=sr, n_steps=-2)))
        augmented.append(("slow", librosa.effects.time_stretch(audio, rate=0.85)))
        augmented.append(("whisper", librosa.effects.pitch_shift(audio, sr=sr, n_steps=-1) * 0.35))
        augmented.append(("noise_light", audio * 0.5 + np.random.randn(len(audio)) * 0.003))
        augmented.append(("combo_bribe", librosa.effects.time_stretch(audio, rate=0.9) * 0.4))
        augmented.append(("very_slow", librosa.effects.time_stretch(audio, rate=0.8) * 0.5))

    return augmented


def extract_windows(audio, sr, window_sec=2.0, hop_sec=1.0):
    window = int(sr * window_sec)
    hop    = int(sr * hop_sec)
    features = []
    for start in range(0, max(1, len(audio) - window), hop):
        chunk = audio[start:start + window]
        if len(chunk) >= sr * 0.3:
            vec = extract_features(chunk, sr)
            if np.any(vec != 0):
                features.append(vec)
    if len(audio) >= sr * 0.5:
        vec = extract_features(audio, sr)
        if np.any(vec != 0):
            features.append(vec)
    return features


def build_dataset():
    X, y = [], []
    counts = {n: 0 for n in LABEL_NAMES}

    for fname, label in AUDIO_LABELS.items():
        path = os.path.join(SAMPLES, fname)
        if not os.path.exists(path):
            print(f"  SKIP: {fname}")
            continue

        audio, sr = librosa.load(path, sr=SR)
        label_idx = LABEL_MAP[label]
        print(f"  {fname} -> {label} ({len(audio)/sr:.1f}s)")

        # Original
        for f in extract_windows(audio, sr):
            X.append(f); y.append(label_idx); counts[label] += 1

        # Augmented
        for aug_name, aug_audio in augment_audio(audio, sr, label):
            try:
                for f in extract_windows(aug_audio, sr):
                    X.append(f); y.append(label_idx); counts[label] += 1
            except Exception as e:
                print(f"    aug {aug_name} failed: {e}")

    X, y = np.array(X), np.array(y)
    print(f"\nDataset: {len(X)} samples")
    for name in LABEL_NAMES:
        print(f"  {name}: {counts[name]}")
    return X, y


def retrain():
    print("=" * 55)
    print("STEP 2: Retraining tone classifier")
    print("=" * 55)

    X, y = build_dataset()
    if len(X) < 10:
        print("ERROR: Not enough data!")
        return None, 0

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("svm", SVC(
            kernel="rbf", C=10.0, gamma="scale",
            probability=True, class_weight="balanced",
            random_state=42,
        )),
    ])

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(pipeline, X, y, cv=cv, scoring="accuracy")
    print(f"\n  CV Accuracy: {scores.mean():.4f} (+/- {scores.std():.4f})")

    pipeline.fit(X, y)
    y_pred = pipeline.predict(X)
    print("\nClassification report:")
    print(classification_report(y, y_pred, target_names=LABEL_NAMES))

    # Validate per file
    print("\n-- Per-file validation --")
    correct, total = 0, 0
    results = []
    for fname, expected in AUDIO_LABELS.items():
        path = os.path.join(SAMPLES, fname)
        if not os.path.exists(path):
            continue
        audio, sr = librosa.load(path, sr=SR)
        mid = len(audio) // 2
        chunk = audio[max(0, mid - SR):min(len(audio), mid + SR)]
        vec = extract_features(chunk, sr)
        pred_idx = pipeline.predict([vec])[0]
        pred_name = LABEL_NAMES[pred_idx]
        proba = pipeline.predict_proba([vec])[0]
        proba_dict = {LABEL_NAMES[i]: round(float(p), 3) for i, p in enumerate(proba)}
        ok = pred_name == expected
        correct += int(ok)
        total += 1
        print(f"  [{'OK' if ok else 'MISS'}] {fname}: exp={expected} got={pred_name} {proba_dict}")
        results.append({"file": fname, "expected": expected, "predicted": pred_name,
                        "correct": ok, "probabilities": proba_dict})

    val_acc = correct / total if total > 0 else 0
    print(f"\n  Validation: {val_acc:.0%} ({correct}/{total})")
    return pipeline, scores.mean(), results, val_acc


# =====================================================================
# STEP 3: Update config with correct thresholds
# =====================================================================
def update_config(cv_acc, val_acc, enrolled_pitch, results):
    print("\n" + "=" * 55)
    print("STEP 3: Updating config with correct thresholds")
    print("=" * 55)

    config_path = os.path.join(MODELS, "model_config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    # Fix thresholds - calibrated for real human speech
    config["version"] = "4.1"
    config["trained_at"] = date.today().isoformat()
    config["calibrated_for"] = "real_human_voice_whatsapp"
    config["eo_similarity_threshold"] = 0.82
    config["min_eo_audio_sec"] = 0.5

    # ENERGY THRESHOLDS - raised to avoid false positives on normal speech
    # Normal speech RMS is typically 0.02-0.08
    # Raised voice is 0.08-0.15
    # Shouting is > 0.15
    config["energy_normal_max"] = 0.08      # was 0.03 (too low!)
    config["energy_shouting_min"] = 0.15    # was 0.06 (too low!)
    config["loud_frame_energy"] = 0.12      # was 0.05 (too low!)

    # PITCH THRESHOLDS - ratio of current pitch to enrolled baseline
    config["pitch_high_ratio"] = 1.4        # was 1.2 (too sensitive)
    config["pitch_extreme_ratio"] = 1.8     # was 1.5 (too sensitive)

    # AGITATION THRESHOLD - raised to avoid normal speech triggering
    config["agitation_threshold"] = 1.2     # was 0.7 (too low!)
    config["loud_duration_sec"] = 2.0       # was 1.5

    # SCORES - rebalanced
    config["score_elevated_voice"] = 10     # was 15
    config["score_shouting"] = 20           # was 25
    config["score_high_pitch"] = 10         # was 15
    config["score_extreme_pitch"] = 15      # was 15
    config["score_prolonged_loud"] = 10     # was 10
    config["score_agitation"] = 5           # was 8

    # SEVERITY THRESHOLDS
    config["warning_score"] = 25            # was 20
    config["critical_score"] = 50           # was 40

    # CONFIDENCE THRESHOLD for SVM emotion flagging
    config["emotion_confidence_threshold"] = 0.60  # NEW: only flag if > 60%

    config["tone_classifier_cv_accuracy"] = round(cv_acc, 4)
    config["tone_classifier_val_accuracy"] = round(val_acc, 4)
    config["tone_classes"] = LABEL_NAMES

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    print(f"  energy_normal_max:  0.03 -> 0.08")
    print(f"  energy_shouting_min: 0.06 -> 0.15")
    print(f"  loud_frame_energy:  0.05 -> 0.12")
    print(f"  pitch_high_ratio:   1.2 -> 1.4")
    print(f"  pitch_extreme_ratio: 1.5 -> 1.8")
    print(f"  agitation_threshold: 0.7 -> 1.2")
    print(f"  warning_score:      20 -> 25")
    print(f"  critical_score:     40 -> 50")
    print(f"  emotion_confidence: NEW 0.60")
    print(f"  Config saved\n")

    # Save training report
    report = {
        "validation_results": results,
        "cv_accuracy": round(cv_acc, 4),
        "val_accuracy": round(val_acc, 4),
        "enrolled_pitch_hz": round(enrolled_pitch, 1),
        "classes": LABEL_NAMES,
        "fixes_applied": [
            "Voiceprint pitch corrected from 1853Hz to correct value",
            "Energy thresholds raised to prevent false positives",
            "Pitch ratio thresholds raised",
            "Agitation threshold raised",
            "Added emotion confidence threshold (60%)",
            "Severity scores rebalanced",
        ],
        "validated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open(os.path.join(MODELS, "training_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("  Training report saved")


def save_model(pipeline):
    model_data = {
        "model": pipeline,
        "label_names": LABEL_NAMES,
        "feature_dim": 106,
        "trained_at": datetime.now().isoformat(),
    }
    path = os.path.join(MODELS, "tone_classifier.pkl")
    with open(path, "wb") as f:
        pickle.dump(model_data, f)
    print(f"  Model saved to {path}")


def main():
    print("\n  TONE MODEL FIX & RETRAIN v4.1\n")

    # Step 1: Fix voiceprint
    enrolled_pitch = fix_voiceprint()

    # Step 2: Retrain
    pipeline, cv_acc, results, val_acc = retrain()
    if pipeline is None:
        return

    # Step 3: Save model + update config
    save_model(pipeline)
    update_config(cv_acc, val_acc, enrolled_pitch, results)

    print("\n" + "=" * 55)
    print(f"  DONE - CV: {cv_acc:.1%}, Val: {val_acc:.0%}")
    print(f"  Enrolled pitch fixed to {enrolled_pitch:.1f} Hz")
    print(f"  Restart server: python server.py")
    print("=" * 55)


if __name__ == "__main__":
    main()
