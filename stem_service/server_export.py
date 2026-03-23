"""
Server-side master export (MVP).

This endpoint is intentionally "offline render" oriented:
  - reads finished stem WAVs from the stem_service OUTPUT_BASE
  - applies a simplified version of the browser DSP chain:
      trim -> effective playbackRate (pitch+timeStretch via resampling)
      gain -> EQ (low/mid/high shelves+peaking) -> compressor
      pan + stereo width
      optional reverb (synthetic convolver) and feedback delay
  - mixes audible stems together (mute/solo semantics)
  - writes a 44.1kHz master WAV to the requested output path

It is not meant to be sample-accurate with WebAudio's internal DSP;
the goal is "audibly affected" mixer controls and an end-to-end server export path.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import os
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import fftconvolve, lfilter, resample


def _get_arg_list() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser()
    p.add_argument("--job-id", required=True, help="stem_service job_id UUID")
    p.add_argument("--output", required=True, help="Absolute or relative output WAV path")
    p.add_argument("--sample-rate", type=int, default=44100, help="Output sample rate (Hz)")
    return p


def _read_payload() -> dict:
    """
    Payload is passed via stdin to avoid command-line length limits.
    Expected:
      {
        "stem_ids": ["vocals", ...],
        "stem_states": { "<stemId>": { trim, mixer, pitchSemitones, timeStretch, ... } },
        "normalize": true|false
      }
    """
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("Missing JSON payload on stdin.")
    try:
        return json.loads(raw)
    except Exception as e:
        raise ValueError(f"Invalid JSON payload: {e}") from e


def effective_playback_rate(state: dict) -> float:
    pitch_semitones = float(state.get("pitchSemitones", 0) or 0)
    time_stretch = float(state.get("timeStretch", 1) or 1)
    if time_stretch <= 0:
        time_stretch = 1.0
    return float(math.pow(2.0, pitch_semitones / 12.0) / time_stretch)


def normalize_audio(stereo: np.ndarray, peak_db: float = -1.0) -> np.ndarray:
    if stereo.size == 0:
        return stereo
    peak = float(np.max(np.abs(stereo)))
    if peak <= 0:
        return stereo
    peak_linear = math.pow(10.0, peak_db / 20.0)
    scale = peak_linear / peak
    return stereo * scale


def biquad_lowshelf_coeff(fs: float, f0: float, gain_db: float, Q: float = 0.7071, S: float = 1.0):
    # RBJ cookbook
    A = math.pow(10.0, gain_db / 40.0)
    w0 = 2.0 * math.pi * f0 / fs
    cosw0 = math.cos(w0)
    sinw0 = math.sin(w0)

    # For shelf filters, RBJ uses slope (S). We'll keep S default 1.
    alpha = sinw0 / 2.0 * math.sqrt((A + 1.0 / A) * (1.0 / S - 1.0) + 2.0)
    beta = 2.0 * math.sqrt(A) * alpha

    b0 = A * ((A + 1.0) - (A - 1.0) * cosw0 + beta)
    b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosw0)
    b2 = A * ((A + 1.0) - (A - 1.0) * cosw0 - beta)
    a0 = (A + 1.0) + (A - 1.0) * cosw0 + beta
    a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosw0)
    a2 = (A + 1.0) + (A - 1.0) * cosw0 - beta

    return _normalize_ba(b0, b1, b2, a0, a1, a2)


def biquad_highshelf_coeff(fs: float, f0: float, gain_db: float, Q: float = 0.7071, S: float = 1.0):
    # RBJ cookbook
    A = math.pow(10.0, gain_db / 40.0)
    w0 = 2.0 * math.pi * f0 / fs
    cosw0 = math.cos(w0)
    sinw0 = math.sin(w0)
    alpha = sinw0 / 2.0 * math.sqrt((A + 1.0 / A) * (1.0 / S - 1.0) + 2.0)
    beta = 2.0 * math.sqrt(A) * alpha

    b0 = A * ((A + 1.0) + (A - 1.0) * cosw0 + beta)
    b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosw0)
    b2 = A * ((A + 1.0) + (A - 1.0) * cosw0 - beta)
    a0 = (A + 1.0) - (A - 1.0) * cosw0 + beta
    a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosw0)
    a2 = (A + 1.0) - (A - 1.0) * cosw0 - beta

    return _normalize_ba(b0, b1, b2, a0, a1, a2)


def biquad_peaking_coeff(fs: float, f0: float, gain_db: float, Q: float):
    # RBJ cookbook
    A = math.pow(10.0, gain_db / 40.0)
    w0 = 2.0 * math.pi * f0 / fs
    cosw0 = math.cos(w0)
    sinw0 = math.sin(w0)
    alpha = sinw0 / (2.0 * Q)

    b0 = 1.0 + alpha * A
    b1 = -2.0 * cosw0
    b2 = 1.0 - alpha * A
    a0 = 1.0 + alpha / A
    a1 = -2.0 * cosw0
    a2 = 1.0 - alpha / A

    return _normalize_ba(b0, b1, b2, a0, a1, a2)


def _normalize_ba(b0, b1, b2, a0, a1, a2):
    if abs(a0) < 1e-12:
        # Degenerate; fall back to bypass.
        return np.array([1.0, 0.0, 0.0]), np.array([1.0, 0.0, 0.0])
    b = np.array([b0 / a0, b1 / a0, b2 / a0], dtype=np.float64)
    a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float64)
    return b, a


def apply_biquad(stereo: np.ndarray, fs: int, b_a_list) -> np.ndarray:
    # b_a_list: iterable of (b, a)
    out = stereo
    for (b, a) in b_a_list:
        # Apply filter per channel.
        out = np.stack([lfilter(b, a, out[:, 0]), lfilter(b, a, out[:, 1])], axis=1)
    return out


def compressor_stereo(
    stereo: np.ndarray,
    fs: int,
    threshold_db: float,
    ratio: float,
    knee_db: float = 6.0,
    attack_s: float = 0.003,
    release_s: float = 0.25,
) -> np.ndarray:
    # Simplified hard/soft knee compressor approximation.
    # WebAudio's dynamicsCompressorNode is more nuanced; this is an audible approximation.
    x = stereo.astype(np.float64, copy=False)

    # Detector: max envelope across channels (more stable than average).
    env = np.max(np.abs(x), axis=1) + 1e-12
    env_db = 20.0 * np.log10(env)
    thr = float(threshold_db)
    r = max(1.0, float(ratio))
    knee = max(0.0, float(knee_db))

    # Compute static gain reduction target (in dB).
    # Soft knee: apply curve within [thr-knee/2, thr+knee/2].
    lower = thr - knee / 2.0
    upper = thr + knee / 2.0
    gain_db = np.zeros_like(env_db)

    # Below lower knee: no reduction.
    mask_low = env_db < lower
    gain_db[mask_low] = 0.0

    # Above upper knee: standard compression.
    mask_high = env_db > upper
    if np.any(mask_high):
        above = env_db[mask_high]
        out_db = thr + (above - thr) / r
        gain_db[mask_high] = out_db - above  # negative or zero

    # Within knee: interpolate between no compression and full compression.
    mask_mid = (~mask_low) & (~mask_high)
    if np.any(mask_mid) and knee > 0:
        mid = env_db[mask_mid]
        # Map mid to 0..1 within knee.
        t = (mid - lower) / knee
        # Linear interpolation of output dB between identity and full compression.
        # Identity: out_db=mid; Full compression: out_db=thr+(mid-thr)/r
        out_identity = mid
        out_full = thr + (mid - thr) / r
        out_db = (1.0 - t) * out_identity + t * out_full
        gain_db[mask_mid] = out_db - mid

    # Convert to linear target gain.
    target_gain = np.power(10.0, gain_db / 20.0)

    attack_samples = max(1, int(attack_s * fs))
    release_samples = max(1, int(release_s * fs))

    # Envelope smoothing in gain domain.
    gain = np.zeros_like(target_gain)
    gain[0] = target_gain[0]
    atk_coeff = math.exp(-1.0 / attack_samples)
    rel_coeff = math.exp(-1.0 / release_samples)

    for i in range(1, len(target_gain)):
        if target_gain[i] < gain[i - 1]:
            # Need more reduction => attack (faster).
            gain[i] = atk_coeff * gain[i - 1] + (1.0 - atk_coeff) * target_gain[i]
        else:
            # Release (slower).
            gain[i] = rel_coeff * gain[i - 1] + (1.0 - rel_coeff) * target_gain[i]

    out = x * gain[:, None]
    return out.astype(np.float32)


def equal_power_pan(mono: np.ndarray, pan_norm: float) -> np.ndarray:
    # pan_norm: [-1, 1] where -1=left, +1=right
    p = max(-1.0, min(1.0, float(pan_norm)))
    # Map pan to angle in [0, pi/2]
    angle = (p + 1.0) * (math.pi / 4.0)
    left_gain = math.cos(angle)
    right_gain = math.sin(angle)
    left = mono * left_gain
    right = mono * right_gain
    return np.stack([left, right], axis=1).astype(np.float32)


def apply_stereo_width(stereo: np.ndarray, width: float) -> np.ndarray:
    g = max(-1.0, min(1.0, float(width) / 100.0))
    l = stereo[:, 0]
    r = stereo[:, 1]
    l_out = l * (1.0 + g) / 2.0 + r * (1.0 - g) / 2.0
    r_out = r * (1.0 + g) / 2.0 + l * (1.0 - g) / 2.0
    return np.stack([l_out, r_out], axis=1).astype(np.float32)


def build_synthetic_reverb_ir(fs: int, duration_sec: float = 1.8) -> np.ndarray:
    length = max(1, int(fs * duration_sec))
    decay = np.power(1.0 - (np.arange(length, dtype=np.float64) / length), 2.0)
    ir = (np.random.rand(2, length).astype(np.float64) * 2.0 - 1.0) * decay[None, :]
    return ir.astype(np.float32)


def convolve_stereo_per_channel(stereo: np.ndarray, ir: np.ndarray) -> np.ndarray:
    # Approximate stereo convolver by convolving each channel with its respective IR channel.
    n = stereo.shape[0]
    out = np.zeros_like(stereo, dtype=np.float32)
    for ch in range(2):
        wet = fftconvolve(stereo[:, ch], ir[ch, :], mode="full")
        out[:, ch] = wet[:n].astype(np.float32)
    return out


def feedback_delay(stereo: np.ndarray, fs: int, delay_sec: float, feedback: float) -> np.ndarray:
    # Implements delay node feedback loop:
    #   y[n] = x[n-delay] + feedback * y[n-delay]
    n = stereo.shape[0]
    delay_samples = int(round(delay_sec * fs))
    if delay_samples <= 0 or n <= delay_samples:
        return np.zeros_like(stereo, dtype=np.float32)

    x = stereo.astype(np.float64, copy=False)
    y = np.zeros_like(x, dtype=np.float64)

    fb = float(feedback)
    for i in range(delay_samples, n):
        j = i - delay_samples
        y[i, 0] = x[j, 0] + fb * y[j, 0]
        y[i, 1] = x[j, 1] + fb * y[j, 1]
    return y.astype(np.float32)


def main():
    ap = _get_arg_list()
    args = ap.parse_args()

    payload = _read_payload()
    stem_ids = payload.get("stem_ids") or []
    stem_states = payload.get("stem_states") or {}
    normalize = bool(payload.get("normalize", True))

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sample_rate_out = int(args.sample_rate)

    # OUTPUT_BASE matches stem_service OUTPUT_BASE contract.
    repo_root = Path(__file__).resolve().parent.parent
    output_base = Path(os.environ.get("STEM_OUTPUT_DIR", str(repo_root / "tmp" / "stems")))

    job_dir = output_base / args.job_id
    stems_dir = job_dir / "stems"

    if not stems_dir.is_dir():
        raise FileNotFoundError(f"Stems dir not found: {stems_dir}")

    processed: list[np.ndarray] = []
    for stem_id in stem_ids:
        state = stem_states.get(stem_id) or {}
        trim = state.get("trim") or {"start": 0, "end": 100}
        mixer = state.get("mixer") or {}
        pitch_semis = state.get("pitchSemitones", 0) or 0
        time_stretch = state.get("timeStretch", 1) or 1

        stem_path = stems_dir / f"{stem_id}.wav"
        if not stem_path.is_file():
            # Caller may have included non-job stems (e.g., loaded-from-browser). Skip gracefully.
            continue

        audio, sr_in = sf.read(str(stem_path), always_2d=True)
        audio = audio.astype(np.float32, copy=False)
        sr_in = int(sr_in)

        # Ensure stereo.
        if audio.shape[1] == 1:
            audio = np.repeat(audio, 2, axis=1)
        elif audio.shape[1] > 2:
            audio = audio[:, :2]

        dur_sec = audio.shape[0] / float(sr_in)
        start_sec = float(trim.get("start", 0)) / 100.0 * dur_sec
        end_sec = float(trim.get("end", 100)) / 100.0 * dur_sec
        start_sec = max(0.0, min(dur_sec, start_sec))
        end_sec = max(start_sec, min(dur_sec, end_sec))

        i0 = int(math.floor(start_sec * sr_in))
        i1 = int(math.ceil(end_sec * sr_in))
        segment = audio[i0:i1, :]
        if segment.shape[0] <= 1:
            continue

        rate = effective_playback_rate(
            {
                "pitchSemitones": pitch_semis,
                "timeStretch": time_stretch,
            }
        )
        if rate <= 0:
            rate = 1.0

        # PlaybackRate changes how quickly the buffer is consumed.
        # In OfflineAudioContext terms, output length is:
        #   out_len = segment_len * (sample_rate_out / (sr_in * rate))
        out_len = int(round(segment.shape[0] * (sample_rate_out / (sr_in * rate))))
        if out_len <= 0:
            continue
        resampled = resample(segment, out_len, axis=0).astype(np.float32, copy=False)

        # --- Gain ---
        gain_db = float(mixer.get("gain", 0) or 0)
        gain_lin = math.pow(10.0, gain_db / 20.0)
        x = resampled * gain_lin

        # --- EQ: lowshelf 200Hz, peaking 1kHz Q=1, highshelf 6kHz ---
        eq_low = float(mixer.get("eqLow", 0) or 0)
        eq_mid = float(mixer.get("eqMid", 0) or 0)
        eq_high = float(mixer.get("eqHigh", 0) or 0)

        biquads = []
        if abs(eq_low) > 1e-6:
            b, a = biquad_lowshelf_coeff(sample_rate_out, 200.0, eq_low)
            biquads.append((b, a))
        if abs(eq_mid) > 1e-6:
            b, a = biquad_peaking_coeff(sample_rate_out, 1000.0, eq_mid, Q=1.0)
            biquads.append((b, a))
        if abs(eq_high) > 1e-6:
            b, a = biquad_highshelf_coeff(sample_rate_out, 6000.0, eq_high)
            biquads.append((b, a))
        if biquads:
            x = apply_biquad(x, sample_rate_out, biquads)

        # --- Compressor ---
        comp_thr_db = float(mixer.get("compThreshold", 0) or 0)
        comp_ratio = float(mixer.get("compRatio", 1) or 1)
        comp_ratio = max(1.0, comp_ratio)
        x = compressor_stereo(
            x,
            sample_rate_out,
            threshold_db=comp_thr_db,
            ratio=comp_ratio,
            knee_db=6.0,
            attack_s=0.003,
            release_s=0.25,
        )

        # Keep compressor output for reverb/delay send.
        comp_out = x

        # --- Pan + Width (dry path) ---
        pan = float(mixer.get("pan", 0) or 0) / 100.0
        dry_mono = np.mean(comp_out, axis=1).astype(np.float32, copy=False)
        dry = equal_power_pan(dry_mono, pan)
        width = float(mixer.get("width", 0) or 0)
        dry = apply_stereo_width(dry, width)

        # --- Reverb ---
        reverb_wet = float(mixer.get("reverbWet", 0) or 0) / 100.0
        if reverb_wet > 1e-6:
            ir = build_synthetic_reverb_ir(sample_rate_out, duration_sec=1.8)
            rev = convolve_stereo_per_channel(comp_out, ir)
            rev_component = rev * reverb_wet
        else:
            rev_component = np.zeros_like(dry, dtype=np.float32)

        # --- Delay ---
        delay_wet = float(mixer.get("delayWet", 0) or 0) / 100.0
        if delay_wet > 1e-6:
            # Matches browser graph: delayNode.delayTime=0.375, feedback=0.35
            delayed = feedback_delay(comp_out, sample_rate_out, delay_sec=0.375, feedback=0.35)
            delay_component = delayed * delay_wet
        else:
            delay_component = np.zeros_like(dry, dtype=np.float32)

        total = dry + rev_component + delay_component
        processed.append(total)

    if not processed:
        raise RuntimeError("No valid processed stems found for server export.")

    out_len = max(p.shape[0] for p in processed)
    master = np.zeros((out_len, 2), dtype=np.float32)
    for p in processed:
        master[: p.shape[0], :] += p

    if normalize:
        master = normalize_audio(master, peak_db=-1.0)

    sf.write(str(out_path), master, sample_rate_out, format="WAV", subtype="PCM_16")


if __name__ == "__main__":
    main()

