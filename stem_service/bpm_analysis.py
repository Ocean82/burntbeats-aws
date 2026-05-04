"""
Lightweight BPM (beats per minute) estimation from audio files.

Uses a simple energy-based onset detection + autocorrelation approach
that works without external libraries beyond numpy and soundfile.
Designed as an optional analysis stage for the stem separation pipeline.

When librosa is available, it uses librosa.beat.beat_track for higher accuracy.
Falls back to the pure-numpy implementation otherwise.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def estimate_bpm(audio_path: Path) -> dict[str, Any] | None:
    """Estimate BPM from an audio file.

    Returns a dict with:
      - bpm: float (estimated beats per minute)
      - beat_offset_seconds: float (timestamp of first detected beat, relative to audio start)
      - confidence: float (0.0–1.0, heuristic confidence in the estimate)

    Returns None if estimation fails or the file cannot be read.
    """
    if not audio_path.exists():
        logger.warning("BPM estimate skipped: file not found %s", audio_path)
        return None

    # Try librosa first (more accurate)
    try:
        return _estimate_bpm_librosa(audio_path)
    except ImportError:
        pass
    except Exception as e:
        logger.debug("librosa BPM estimation failed, falling back: %s", e)

    # Fallback: pure numpy implementation
    try:
        return _estimate_bpm_numpy(audio_path)
    except Exception as e:
        logger.warning("BPM estimation failed for %s: %s", audio_path, e)
        return None


def _estimate_bpm_librosa(audio_path: Path) -> dict[str, Any]:
    """BPM estimation using librosa.beat.beat_track (higher accuracy)."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(audio_path), sr=22050, mono=True, duration=60)

    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)

    if isinstance(tempo, np.ndarray):
        bpm = float(tempo[0]) if len(tempo) > 0 else 0.0
    else:
        bpm = float(tempo)

    beat_times = librosa.frames_to_time(beats, sr=sr)
    beat_offset = float(beat_times[0]) if len(beat_times) > 0 else 0.0

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    confidence = _confidence_from_onset_env(np.asarray(onset_env, dtype=np.float64))
    confidence_ref: dict[str, float] = {"value": confidence}
    bpm = _normalize_bpm_range(bpm, confidence_ref=confidence_ref)
    if confidence_ref["value"] == 0.0:
        confidence = 0.0

    return {
        "bpm": round(bpm, 2),
        "beat_offset_seconds": round(beat_offset, 4),
        "confidence": confidence,
    }


def _estimate_bpm_numpy(audio_path: Path) -> dict[str, Any]:
    """BPM estimation using energy-based onset detection + autocorrelation.

    This is a simplified approach that:
    1. Loads audio and computes short-time energy
    2. Detects onset frames using energy difference thresholding
    3. Uses autocorrelation of the onset envelope to find the dominant period
    4. Converts period to BPM
    """
    import soundfile as sf
    import numpy as np

    data, sr = sf.read(str(audio_path))
    if data.ndim > 1:
        data = data.mean(axis=1)

    # Work with up to 60 seconds for performance
    max_samples = 60 * sr
    if len(data) > max_samples:
        data = data[:max_samples]

    # Compute short-time energy (10ms windows, 5ms hop)
    window_size = int(0.01 * sr)
    hop_size = int(0.005 * sr)

    energy = []
    for i in range(0, len(data) - window_size, hop_size):
        frame = data[i : i + window_size]
        energy.append(np.sum(frame ** 2))

    energy = np.array(energy)
    if len(energy) < 10:
        return {"bpm": 0.0, "beat_offset_seconds": 0.0, "confidence": 0.0}

    # Normalize energy
    energy = (energy - np.mean(energy)) / (np.std(energy) + 1e-10)

    # Onset detection function: positive differences
    onset_env = np.maximum(np.diff(energy), 0)
    if len(onset_env) < 10:
        return {"bpm": 0.0, "beat_offset_seconds": 0.0, "confidence": 0.0}

    # Autocorrelation to find dominant periodicity
    # Search range: 60-200 BPM => period of 0.3s to 1.0s
    min_period_samples = int(0.3 * sr / hop_size)
    max_period_samples = int(1.0 * sr / hop_size)

    autocorr = np.correlate(onset_env, onset_env, mode="full")
    autocorr = autocorr[len(autocorr) // 2 :]

    # Find peak in the valid BPM range
    if max_period_samples >= len(autocorr):
        max_period_samples = len(autocorr) - 1
    if min_period_samples >= max_period_samples:
        min_period_samples = max(1, max_period_samples // 2)

    search_region = autocorr[min_period_samples:max_period_samples + 1]
    if len(search_region) == 0:
        return {"bpm": 0.0, "beat_offset_seconds": 0.0, "confidence": 0.0}

    peak_idx = int(np.argmax(search_region))
    best_period = min_period_samples + peak_idx

    # Convert period to BPM
    hop_duration = hop_size / sr
    period_seconds = best_period * hop_duration
    bpm = 60.0 / period_seconds if period_seconds > 0 else 0.0

    confidence_ref: dict[str, float] = {"value": 1.0}
    bpm = _normalize_bpm_range(bpm, confidence_ref=confidence_ref)

    # Find first onset as beat offset
    threshold = np.mean(onset_env) + 0.5 * np.std(onset_env)
    onset_indices = np.where(onset_env > threshold)[0]
    beat_offset = float(onset_indices[0] * hop_duration) if len(onset_indices) > 0 else 0.0

    confidence = _confidence_from_peak_stats(search_region[peak_idx], np.median(search_region))
    if confidence_ref["value"] == 0.0:
        confidence = 0.0

    return {
        "bpm": round(float(bpm), 2),
        "beat_offset_seconds": round(float(beat_offset), 4),
        "confidence": round(float(confidence), 2),
    }


def _normalize_bpm_range(
    bpm: float,
    *,
    confidence_ref: dict[str, float],
    min_bpm: float = 40.0,
    max_bpm: float = 220.0,
) -> float:
    """Normalize likely half/double-time errors without hard-clamping valid tempos."""
    if bpm <= 0:
        confidence_ref["value"] = 0.0
        return 0.0

    normalized = float(bpm)
    if normalized < min_bpm and normalized * 2 <= max_bpm:
        normalized *= 2
    elif normalized > max_bpm and normalized / 2 >= min_bpm:
        normalized /= 2

    if normalized < min_bpm or normalized > max_bpm:
        confidence_ref["value"] = 0.0
    return normalized


def _confidence_from_peak_stats(peak_val: float, noise_floor: float) -> float:
    if peak_val <= 0:
        return 0.0
    return min(1.0, max(0.0, (peak_val - noise_floor) / (peak_val + 1e-10)))


def _confidence_from_onset_env(onset_env: Any) -> float:
    try:
        import numpy as np
    except Exception:
        return 0.0
    env = np.asarray(onset_env, dtype=np.float64)
    if env.size < 4:
        return 0.0
    env = env - np.mean(env)
    denom = float(np.std(env))
    if denom <= 1e-9:
        return 0.0
    env = env / denom
    autocorr = np.correlate(env, env, mode="full")
    autocorr = autocorr[len(autocorr) // 2 :]
    if autocorr.size < 3:
        return 0.0
    # Ignore lag 0 and use dominant periodic peak prominence.
    search = autocorr[1:]
    peak_val = float(np.max(search))
    noise_floor = float(np.median(search))
    return round(_confidence_from_peak_stats(peak_val, noise_floor), 2)
