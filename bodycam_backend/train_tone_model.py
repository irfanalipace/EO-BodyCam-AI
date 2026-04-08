"""
Train Tone Classifier — NORMAL / HARSH / ANGRY / BRIBE_TONE
Uses existing audio samples + heavy data augmentation to build a robust SVM.
Run: python train_tone_model.py
"""
import os, json, pickle, warnings
import numpy as np
import librosa
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report

warnings.filterwarnings("ignore")

BASE    = os.path.dirname(os.path.abspath(__file__))
MODELS  = os.path.join(BASE, "models")
SAMPLES = os.path.join(BASE, "audio_samples")
SR      = 16000

# ── Label mapping for audio files ────────────────────────────────────
AUDIO_LABELS = {
    # EO officer samples
    "eo_normal.wav":           "NORMAL",
    "eo_harsh.wav":            "HARSH",
    "eo_bribe.wav":            "BRIBE_TONE",
    "eo_threat.wav":           "ANGRY",
    "enrollment_eo.wav":       "NORMAL",
    # Civilian / background
    "customer_voice.wav":      "NORMAL",
    "shopkeeper_voice.wav":    "NORMAL",
    # Market scene composites
    "market_scene_normal.wav": "NORMAL",
    "market_scene_harsh.wav":  "HARSH",
    "market_scene_bribe.wav":  "BRIBE_TONE",
    "market_scene_no_eo.wav":  "NORMAL",
}

LABEL_NAMES = ["NORMAL", "HARSH", "ANGRY", "BRIBE_TONE"]
LABEL_MAP   = {n: i for i, n in enumerate(LABEL_NAMES)}


def extract_features(audio, sr=SR):
    """106-dim feature vector — must match server.py exactly."""
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
        f0, vf, _ = librosa.pyin(audio, sr=sr, fmin=65, fmax=2093)
        fv  = f0[vf] if vf is not None else np.array([])
        f0m = float(np.mean(fv)) if len(fv) > 0 else 0.0
        f0s = float(np.std(fv))  if len(fv) > 0 else 0.0
    except:
        f0m, f0s = 0.0, 0.0
    return np.concatenate([m_mean, m_std, scon, chroma, [sc, sb, sro, f0m, f0s, zcr, rms]])


# ── Data augmentation ────────────────────────────────────────────────
def augment_pitch_up(audio, sr, n_steps=2):
    return librosa.effects.pitch_shift(audio, sr=sr, n_steps=n_steps)

def augment_pitch_down(audio, sr, n_steps=-2):
    return librosa.effects.pitch_shift(audio, sr=sr, n_steps=n_steps)

def augment_speed_up(audio, rate=1.15):
    return librosa.effects.time_stretch(audio, rate=rate)

def augment_speed_down(audio, rate=0.85):
    return librosa.effects.time_stretch(audio, rate=rate)

def augment_add_noise(audio, noise_level=0.005):
    noise = np.random.randn(len(audio)) * noise_level
    return audio + noise

def augment_louder(audio, gain=2.0):
    return np.clip(audio * gain, -1.0, 1.0)

def augment_quieter(audio, gain=0.4):
    return audio * gain

def augment_pitch_extreme(audio, sr, n_steps=4):
    return librosa.effects.pitch_shift(audio, sr=sr, n_steps=n_steps)

def augment_combined_angry(audio, sr):
    """Simulate angry: louder + higher pitch + faster."""
    a = librosa.effects.pitch_shift(audio, sr=sr, n_steps=3)
    a = librosa.effects.time_stretch(a, rate=1.2)
    return np.clip(a * 1.8, -1.0, 1.0)

def augment_combined_harsh(audio, sr):
    """Simulate harsh: slightly louder + faster + noise."""
    a = librosa.effects.time_stretch(audio, rate=1.1)
    a = a + np.random.randn(len(a)) * 0.008
    return np.clip(a * 1.5, -1.0, 1.0)

def augment_combined_calm(audio, sr):
    """Simulate calm: quieter + slower + lower pitch."""
    a = librosa.effects.pitch_shift(audio, sr=sr, n_steps=-1)
    a = librosa.effects.time_stretch(a, rate=0.9)
    return a * 0.6


# ── Define augmentations per class ───────────────────────────────────
# More augmentations for underrepresented classes (ANGRY, BRIBE_TONE)
AUGMENTATIONS = {
    "NORMAL": [
        ("pitch_up",    lambda a, sr: augment_pitch_up(a, sr, 1)),
        ("pitch_down",  lambda a, sr: augment_pitch_down(a, sr, -1)),
        ("noise",       lambda a, sr: augment_add_noise(a, 0.003)),
        ("quiet",       lambda a, sr: augment_quieter(a, 0.5)),
        ("calm",        lambda a, sr: augment_combined_calm(a, sr)),
        ("speed_down",  lambda a, sr: augment_speed_down(a, 0.9)),
    ],
    "HARSH": [
        ("pitch_up",    lambda a, sr: augment_pitch_up(a, sr, 2)),
        ("pitch_down",  lambda a, sr: augment_pitch_down(a, sr, -1)),
        ("loud",        lambda a, sr: augment_louder(a, 1.8)),
        ("noise",       lambda a, sr: augment_add_noise(a, 0.006)),
        ("speed_up",    lambda a, sr: augment_speed_up(a, 1.1)),
        ("harsh_combo", lambda a, sr: augment_combined_harsh(a, sr)),
        ("pitch_ext",   lambda a, sr: augment_pitch_extreme(a, sr, 3)),
        ("loud_noise",  lambda a, sr: augment_add_noise(augment_louder(a, 2.0), 0.005)),
    ],
    "ANGRY": [
        ("pitch_up",     lambda a, sr: augment_pitch_up(a, sr, 3)),
        ("pitch_up2",    lambda a, sr: augment_pitch_up(a, sr, 4)),
        ("loud",         lambda a, sr: augment_louder(a, 2.0)),
        ("very_loud",    lambda a, sr: augment_louder(a, 2.5)),
        ("noise",        lambda a, sr: augment_add_noise(a, 0.008)),
        ("speed_up",     lambda a, sr: augment_speed_up(a, 1.2)),
        ("angry_combo",  lambda a, sr: augment_combined_angry(a, sr)),
        ("pitch_ext",    lambda a, sr: augment_pitch_extreme(a, sr, 5)),
        ("angry_loud",   lambda a, sr: augment_louder(augment_pitch_up(a, sr, 3), 2.0)),
        ("angry_fast",   lambda a, sr: augment_speed_up(augment_louder(a, 1.8), 1.25)),
    ],
    "BRIBE_TONE": [
        ("pitch_up",    lambda a, sr: augment_pitch_up(a, sr, 1)),
        ("pitch_down",  lambda a, sr: augment_pitch_down(a, sr, -2)),
        ("quiet",       lambda a, sr: augment_quieter(a, 0.5)),
        ("very_quiet",  lambda a, sr: augment_quieter(a, 0.3)),
        ("noise",       lambda a, sr: augment_add_noise(a, 0.004)),
        ("speed_down",  lambda a, sr: augment_speed_down(a, 0.85)),
        ("speed_up",    lambda a, sr: augment_speed_up(a, 1.05)),
        ("whisper",     lambda a, sr: augment_quieter(augment_pitch_down(a, sr, -1), 0.4)),
        ("low_noise",   lambda a, sr: augment_add_noise(augment_quieter(a, 0.5), 0.003)),
    ],
}


def extract_windows(audio, sr, window_sec=2.0, hop_sec=1.0):
    """Slide a window across audio and return feature vectors."""
    window = int(sr * window_sec)
    hop    = int(sr * hop_sec)
    features = []
    for start in range(0, max(1, len(audio) - window), hop):
        chunk = audio[start:start + window]
        if len(chunk) >= sr * 0.3:
            vec = extract_features(chunk, sr)
            if np.any(vec != 0):
                features.append(vec)
    # Also extract from the full audio
    if len(audio) >= sr * 0.5:
        vec = extract_features(audio, sr)
        if np.any(vec != 0):
            features.append(vec)
    return features


def build_dataset():
    """Load audio samples, apply augmentation, extract features."""
    X, y = [], []
    class_counts = {n: 0 for n in LABEL_NAMES}

    for fname, label in AUDIO_LABELS.items():
        path = os.path.join(SAMPLES, fname)
        if not os.path.exists(path):
            print(f"  SKIP (not found): {fname}")
            continue

        audio, sr = librosa.load(path, sr=SR)
        label_idx = LABEL_MAP[label]
        print(f"  {fname} -> {label} ({len(audio)/sr:.1f}s)")

        # Original audio windows
        feats = extract_windows(audio, sr)
        for f in feats:
            X.append(f)
            y.append(label_idx)
            class_counts[label] += 1

        # Augmented versions
        for aug_name, aug_fn in AUGMENTATIONS[label]:
            try:
                aug_audio = aug_fn(audio, sr)
                aug_feats = extract_windows(aug_audio, sr)
                for f in aug_feats:
                    X.append(f)
                    y.append(label_idx)
                    class_counts[label] += 1
            except Exception as e:
                print(f"    augment {aug_name} failed: {e}")

    X = np.array(X)
    y = np.array(y)
    print(f"\nDataset: {len(X)} samples")
    for name in LABEL_NAMES:
        print(f"  {name}: {class_counts[name]} samples")
    return X, y


def train_model(X, y):
    """Train SVM pipeline with cross-validation."""
    print("\nTraining SVM classifier...")

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("svm", SVC(
            kernel="rbf",
            C=10.0,
            gamma="scale",
            probability=True,
            class_weight="balanced",
            random_state=42,
        )),
    ])

    # Cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(pipeline, X, y, cv=cv, scoring="accuracy")
    print(f"  CV Accuracy: {scores.mean():.4f} (+/- {scores.std():.4f})")
    print(f"  Per fold: {[f'{s:.4f}' for s in scores]}")

    # Train on full dataset
    pipeline.fit(X, y)

    # Full dataset classification report
    y_pred = pipeline.predict(X)
    print("\nFull dataset classification report:")
    print(classification_report(y, y_pred, target_names=LABEL_NAMES))

    return pipeline, scores.mean()


def validate_model(pipeline):
    """Validate on each audio file individually."""
    print("\n-- Validation on audio files --")
    results = []
    correct = 0
    total   = 0

    for fname, expected in AUDIO_LABELS.items():
        path = os.path.join(SAMPLES, fname)
        if not os.path.exists(path):
            continue

        audio, sr = librosa.load(path, sr=SR)
        # Extract from center 2s
        mid   = len(audio) // 2
        chunk = audio[max(0, mid - SR):min(len(audio), mid + SR)]
        vec   = extract_features(chunk, sr)

        pred_idx  = pipeline.predict([vec])[0]
        pred_name = LABEL_NAMES[pred_idx]
        proba     = pipeline.predict_proba([vec])[0]
        proba_dict = {LABEL_NAMES[i]: round(float(p), 3) for i, p in enumerate(proba)}

        match = pred_name == expected
        correct += int(match)
        total += 1

        status = "OK" if match else "MISS"
        print(f"  [{status}] {fname}: expected={expected}, got={pred_name}  {proba_dict}")
        results.append({
            "file": fname,
            "expected": expected,
            "predicted": pred_name,
            "correct": match,
            "probabilities": proba_dict,
        })

    acc = correct / total if total > 0 else 0
    print(f"\nValidation accuracy: {acc:.1%} ({correct}/{total})")
    return results, acc


def save_model(pipeline, cv_accuracy, validation_results, val_accuracy):
    """Save the trained model and update config."""
    # Save model pickle
    model_data = {
        "model": pipeline,
        "label_names": LABEL_NAMES,
        "feature_dim": 106,
        "trained_at": __import__("datetime").datetime.now().isoformat(),
    }
    model_path = os.path.join(MODELS, "tone_classifier.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model_data, f)
    print(f"\nSaved model to {model_path}")

    # Update config
    config_path = os.path.join(MODELS, "model_config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    config["version"] = "4.0"
    config["trained_at"] = __import__("datetime").date.today().isoformat()
    config["tone_classifier_cv_accuracy"] = round(cv_accuracy, 4)
    config["tone_classifier_val_accuracy"] = round(val_accuracy, 4)
    config["tone_classes"] = LABEL_NAMES

    # -- Enhanced violation keywords --
    config["violation_keywords"] = {
        "RISHWAT": {
            "score": 50,
            "severity": "CRITICAL",
            "label": "Bribe / Rishwat",
            "words": [
                "paisa", "paisay", "paise", "rishwat", "deal",
                "chhod do", "chod do", "jaane do", "jane do",
                "kuch kar lete hain", "kuch kar lo",
                "sulah kar lete hain", "sulah kar lo",
                "de do paisa", "kuch de do",
                "chhod deta hoon", "deal kar lete hain",
                "kuch nikal", "paisa dena hoga",
                "le lo kuch", "maaf kar do",
                "kuch lay lo", "seedha kar lete hain",
                "nipta lete hain", "bahar nikal", "milao kuch",
                "idhar se le lo", "udhar se de do",
                "thora sa de do", "maamla nipta lo",
                "baat ban jaye gi", "samjhota kar lo",
                "pocket mein daal", "haath garam karo",
            ]
        },
        "DHAMKI": {
            "score": 45,
            "severity": "CRITICAL",
            "label": "Threat / Dhamki",
            "words": [
                "arrest kar", "arrest karunga", "arrest kar loon ga",
                "jail", "jail bharwa doon ga", "jail mein daal",
                "thana", "thane le jaon ga",
                "maar", "maar doon ga", "marunga",
                "nahi chhorra", "nahi chorunga", "nahi chhutunga",
                "abhi dekhta hoon", "dekhta hoon tujhe",
                "band kara doon ga", "band kar deta hoon",
                "pakad ke le jaoon ga", "pakad loon ga",
                "ghar ka pata hai", "ghar pata hai",
                "pata lagta hai", "maza chakaoon ga",
                "andar kar deta hoon", "andar kar doon",
                "tujhe chhorunga nahi", "tujhe nahi chhodunga",
                "dekh lena", "dekh le phir",
                "tod doon ga", "todh deta hoon",
                "khatam kar doon ga", "barbaad kar doon ga",
            ]
        },
        "GALI": {
            "score": 30,
            "severity": "HIGH",
            "label": "Abusive Language / Gali",
            "words": [
                "gadha", "gadhe", "bewaqoof", "bewakoof",
                "chup", "chup kar", "chup reh",
                "andar kar doon", "tameez nahi", "tameez seekh",
                "jao yahan se", "niklo yahan se",
                "jahil", "ullu", "pagal",
                "bakwaas band kar", "besharam", "kamine",
                "harami", "jhooth bol raha", "jhoota",
                "kutte", "kutta", "suar", "janwar",
                "nalayak", "nikamma", "neech",
                "badtameez", "ghatiya", "kamina",
                "haramkhor", "zaleel", "laanat",
                "muh band kar", "teri aukaat",
                "ganda", "gandi", "gandagi",
                "shaitan", "manhoos", "paagal",
            ]
        },
        "RUDE_BEHAVIOR": {
            "score": 25,
            "severity": "HIGH",
            "label": "Rude Behavior",
            "words": [
                "chup raho", "chup reh", "baat mat karo",
                "chalte bano", "nikal jao", "nikal",
                "hato yahan se", "bhago", "jaao",
                "zyada baat mat karo", "seedha raho",
                "mat sikhaao mujhe", "tum kya jaano",
                "apna kaam karo", "seedha jawab do",
                "hat jao", "dur ho jao", "side ho jao",
                "dimag mat kharab kar",
                "bakwaas band karo", "time waste mat karo",
                "tu jaanta nahi", "tu jaanti nahi",
                "mujhse mat uljho", "apni haisiyat dekho",
                "sun ke raho", "bolne ki zaroorat nahi",
            ]
        },
        "HARASSMENT": {
            "score": 35,
            "severity": "HIGH",
            "label": "Harassment",
            "words": [
                "akela pakad loon ga", "akela milna",
                "teri naukri jaye gi", "naukri jayegi",
                "baad mein dekhna", "baad mein milna",
                "janta hoon teri aukaat", "aukaat dikhaoon ga",
                "ghar se nikal doon ga", "ghar band",
                "tujhe maza chakaoon ga", "pachtao ge",
                "teri dukaan band", "dukaan band kara doon ga",
                "roz aata rahunga", "roz tang karunga",
                "tera kaam khatam", "tujhe chodunga nahi",
                "aurat ko baat kar", "bibi ko bula",
                "bachon ka socho", "family ko puchoon",
                "raat ko milta hoon", "akela mat milna",
            ]
        },
        "GALAT_CHALLAN": {
            "score": 20,
            "severity": "MEDIUM",
            "label": "Wrong / Illegal Challan",
            "words": [
                "ghalt challan", "galat challan",
                "galat amount", "extra paisa",
                "bina wajah challan", "galat likha",
                "zyada likh diya", "yeh galat hai",
                "bekaar challan", "jhooth likha",
                "document nahi", "kagaz nahi",
                "receipt nahi di", "parchi nahi",
                "kitna likha hai", "zyada amount",
            ]
        },
        "ANGRY_TONE": {
            "score": 20,
            "severity": "HIGH",
            "label": "Angry / Aggressive Tone",
            "words": [
                "gussa", "gussa aa raha", "gussa mat dilao",
                "chillao mat", "chilla raha", "chillana band karo",
                "awaaz neechi karo", "awaaz kam karo",
                "cheekh", "cheekh raha", "cheekh mat",
                "daant", "daant raha", "daantna band kar",
                "lalkaar", "dhamka", "ghurak",
                "taiz awaaz", "shor mat macha",
                "zor se bol raha", "zor zor se",
            ]
        },
    }

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print(f"Updated config: {config_path}")

    # Save training report
    report = {
        "validation_results": validation_results,
        "cv_accuracy": round(cv_accuracy, 4),
        "val_accuracy": round(val_accuracy, 4),
        "total_samples_trained": "augmented",
        "classes": LABEL_NAMES,
        "validated_at": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    report_path = os.path.join(MODELS, "training_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"Saved report: {report_path}")


def main():
    print("=" * 60)
    print("  Tone Classifier Training - v4.0")
    print("  Classes: NORMAL / HARSH / ANGRY / BRIBE_TONE")
    print("=" * 60)

    print("\n-- Loading & augmenting audio samples --")
    X, y = build_dataset()

    if len(X) < 10:
        print("ERROR: Not enough training data!")
        return

    pipeline, cv_acc = train_model(X, y)
    results, val_acc = validate_model(pipeline)
    save_model(pipeline, cv_acc, results, val_acc)

    print("\n" + "=" * 60)
    print(f"  DONE — CV accuracy: {cv_acc:.1%}, Validation: {val_acc:.1%}")
    print("=" * 60)


if __name__ == "__main__":
    main()
