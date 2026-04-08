"""
Retrain tone classifier v4.2 — fix HARSH false positives on real-world audio.
Problem: training normals have rms=0.12-0.22 but real audio is rms=0.03-0.08
Solution: heavy augmentation covering wide energy/pitch range for NORMAL class
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
    m_std  = np.std(mfccs, axis=1)
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


def augment_normal(audio, sr):
    """Generate MANY diverse normal samples covering real-world conditions.
    Real-world normal speech: rms=0.02-0.08, various noise levels, pitch ranges.
    Training normals: rms=0.12-0.22 (too loud compared to real recordings).
    """
    augmented = []

    # === VOLUME: cover full range from very quiet to normal ===
    for gain in [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.60, 0.80]:
        augmented.append(audio * gain)

    # === NOISE: different noise levels at different volumes ===
    for gain in [0.15, 0.25, 0.35, 0.50]:
        for noise_level in [0.002, 0.005, 0.008]:
            noisy = audio * gain + np.random.randn(len(audio)) * noise_level
            augmented.append(noisy)

    # === PITCH: slight variations (normal speech pitch varies) ===
    for steps in [-2, -1, 1, 2]:
        shifted = librosa.effects.pitch_shift(audio, sr=sr, n_steps=steps)
        augmented.append(shifted)
        # Also at lower volume
        augmented.append(shifted * 0.25)
        augmented.append(shifted * 0.40)

    # === SPEED: slight variations ===
    for rate in [0.88, 0.94, 1.06, 1.12]:
        stretched = librosa.effects.time_stretch(audio, rate=rate)
        augmented.append(stretched)
        augmented.append(stretched * 0.30)

    # === COMBINED: pitch + volume + noise (simulating real recordings) ===
    for steps in [-1, 0, 1]:
        a = librosa.effects.pitch_shift(audio, sr=sr, n_steps=steps) if steps != 0 else audio
        for gain in [0.15, 0.25, 0.40]:
            for noise in [0.002, 0.005]:
                augmented.append(a * gain + np.random.randn(len(a)) * noise)

    return augmented


def augment_harsh(audio, sr):
    """Harsh = clearly louder, higher pitch, aggressive."""
    augmented = []
    # Harsh must be LOUD and high-pitched to be clearly different from normal
    for gain in [1.8, 2.0, 2.5, 3.0]:
        augmented.append(np.clip(audio * gain, -1, 1))
    for steps in [2, 3, 4]:
        shifted = librosa.effects.pitch_shift(audio, sr=sr, n_steps=steps)
        augmented.append(shifted)
        augmented.append(np.clip(shifted * 2.0, -1, 1))
    for rate in [1.1, 1.2]:
        augmented.append(librosa.effects.time_stretch(audio, rate=rate))
    # Combined harsh: loud + high pitch + fast
    augmented.append(np.clip(librosa.effects.pitch_shift(audio, sr=sr, n_steps=3) * 2.5, -1, 1))
    augmented.append(np.clip(librosa.effects.time_stretch(audio, rate=1.15) * 2.0, -1, 1))
    # Noisy harsh
    augmented.append(np.clip(audio * 2.5 + np.random.randn(len(audio)) * 0.01, -1, 1))
    return augmented


def augment_angry(audio, sr):
    """Angry = very loud, very high pitch, fast, extreme."""
    augmented = []
    for gain in [2.5, 3.0, 3.5]:
        augmented.append(np.clip(audio * gain, -1, 1))
    for steps in [3, 4, 5, 6]:
        shifted = librosa.effects.pitch_shift(audio, sr=sr, n_steps=steps)
        augmented.append(shifted)
        augmented.append(np.clip(shifted * 2.5, -1, 1))
    for rate in [1.2, 1.3, 1.4]:
        augmented.append(librosa.effects.time_stretch(audio, rate=rate))
    # Combined extreme
    augmented.append(np.clip(librosa.effects.pitch_shift(audio, sr=sr, n_steps=5) * 3.0, -1, 1))
    augmented.append(np.clip(librosa.effects.time_stretch(audio, rate=1.3) * 2.5, -1, 1))
    augmented.append(np.clip(audio * 3.0 + np.random.randn(len(audio)) * 0.015, -1, 1))
    return augmented


def augment_bribe(audio, sr):
    """Bribe = quiet, secretive, slow, low pitch."""
    augmented = []
    for gain in [0.20, 0.30, 0.40, 0.50]:
        augmented.append(audio * gain)
    for steps in [-1, -2, -3]:
        shifted = librosa.effects.pitch_shift(audio, sr=sr, n_steps=steps)
        augmented.append(shifted)
        augmented.append(shifted * 0.30)
    for rate in [0.80, 0.85, 0.90]:
        augmented.append(librosa.effects.time_stretch(audio, rate=rate))
        augmented.append(librosa.effects.time_stretch(audio, rate=rate) * 0.35)
    # Whisper-like
    augmented.append(audio * 0.15 + np.random.randn(len(audio)) * 0.002)
    augmented.append(librosa.effects.pitch_shift(audio, sr=sr, n_steps=-2) * 0.25)
    return augmented


AUGMENTERS = {
    "NORMAL": augment_normal,
    "HARSH": augment_harsh,
    "ANGRY": augment_angry,
    "BRIBE_TONE": augment_bribe,
}


def build_dataset():
    X, y = [], []
    counts = {n: 0 for n in LABEL_NAMES}

    for fname, label in AUDIO_LABELS.items():
        path = os.path.join(SAMPLES, fname)
        if not os.path.exists(path):
            continue
        audio, sr = librosa.load(path, sr=SR)
        label_idx = LABEL_MAP[label]
        print(f"  {fname} -> {label} ({len(audio)/sr:.1f}s)", flush=True)

        # Original windows
        for f in extract_windows(audio, sr):
            X.append(f); y.append(label_idx); counts[label] += 1

        # Augmented
        aug_fn = AUGMENTERS[label]
        for aug_audio in aug_fn(audio, sr):
            try:
                for f in extract_windows(aug_audio, sr):
                    X.append(f); y.append(label_idx); counts[label] += 1
            except:
                pass

    X, y = np.array(X), np.array(y)
    print(f"\nDataset: {len(X)} total samples", flush=True)
    for name in LABEL_NAMES:
        print(f"  {name}: {counts[name]}", flush=True)
    return X, y


def main():
    print("=" * 55, flush=True)
    print("  Retraining Tone Classifier v4.2", flush=True)
    print("  Fix: NORMAL covers rms=0.02-0.20 range", flush=True)
    print("=" * 55, flush=True)

    print("\n-- Building dataset --", flush=True)
    X, y = build_dataset()

    print("\n-- Training SVM --", flush=True)
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
    cv_acc = scores.mean()
    print(f"  CV Accuracy: {cv_acc:.4f} (+/- {scores.std():.4f})", flush=True)

    pipeline.fit(X, y)
    y_pred = pipeline.predict(X)
    print(classification_report(y, y_pred, target_names=LABEL_NAMES), flush=True)

    # Validate
    print("-- Per-file validation --", flush=True)
    correct, total = 0, 0
    results = []
    for fname, expected in AUDIO_LABELS.items():
        path = os.path.join(SAMPLES, fname)
        if not os.path.exists(path):
            continue
        audio, sr = librosa.load(path, sr=SR)

        # Test at MULTIPLE volumes (including real-world quiet levels)
        mid = len(audio) // 2
        chunk = audio[max(0, mid - SR):min(len(audio), mid + SR)]

        for vol_name, vol_gain in [("original", 1.0), ("quiet_0.25", 0.25), ("quiet_0.15", 0.15)]:
            test_chunk = chunk * vol_gain
            vec = extract_features(test_chunk, sr)
            pred_idx = pipeline.predict([vec])[0]
            pred_name = LABEL_NAMES[pred_idx]
            proba = pipeline.predict_proba([vec])[0]
            proba_dict = {LABEL_NAMES[i]: round(float(p), 3) for i, p in enumerate(proba)}
            ok = pred_name == expected
            correct += int(ok)
            total += 1
            status = "OK" if ok else "MISS"
            print(f"  [{status}] {fname} ({vol_name}): exp={expected} got={pred_name} {proba_dict}", flush=True)
            if vol_name == "original":
                results.append({"file": fname, "expected": expected, "predicted": pred_name,
                                "correct": ok, "probabilities": proba_dict})

    val_acc = correct / total if total > 0 else 0
    print(f"\n  Validation: {val_acc:.0%} ({correct}/{total})", flush=True)

    # Save model
    model_data = {
        "model": pipeline,
        "label_names": LABEL_NAMES,
        "feature_dim": 106,
        "trained_at": datetime.now().isoformat(),
    }
    model_path = os.path.join(MODELS, "tone_classifier.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model_data, f)
    print(f"\n  Model saved: {model_path}", flush=True)

    # Update config
    config_path = os.path.join(MODELS, "model_config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    config["version"] = "4.2"
    config["trained_at"] = date.today().isoformat()
    config["tone_classifier_cv_accuracy"] = round(cv_acc, 4)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    # Save report
    report = {
        "validation_results": results,
        "cv_accuracy": round(cv_acc, 4),
        "classes": LABEL_NAMES,
        "fix": "NORMAL augmented to cover rms=0.02-0.20 matching real-world audio",
        "validated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open(os.path.join(MODELS, "training_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*55}", flush=True)
    print(f"  DONE - CV: {cv_acc:.1%}", flush=True)
    print(f"  Normal audio at 0.15x volume should now classify as NORMAL", flush=True)
    print(f"{'='*55}", flush=True)


if __name__ == "__main__":
    main()
