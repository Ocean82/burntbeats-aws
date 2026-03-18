"""
Single-pass 4-stem separation using htdemucs ONNX models.

Probed tensor shapes (scripts/probe_onnx.py):

htdemucs_embedded.onnx:
  inputs:  'input' (1,2,343980)  'x' (1,4,2048,336)
  outputs: 'output' (1,4,4,2048,336)  'add_67' (1,4,2,343980)  ← use this

htdemucs_6s.onnx:
  inputs:  'input' (1,2,343980)  'onnx::ReduceMean_1' (1,4,2048,336)
  outputs: 'output' (1,6,4,2048,336)  '5012' (1,6,2,343980)  ← use this

demucsv4.onnx (single-input variant):
  inputs:  'input' (1,2,343980)
  outputs: 'output' (1,6,2,343980)

Output waveform shape: (1, n_stems, 2, 343980)
Stem order (both models): drums=0, bass=1, other=2, vocals=3 [, guitar=4, piano=5 for 6s]
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import numpy as np

from config import MODELS_DIR, TARGET_SAMPLE_RATE, get_onnx_providers

logger = logging.getLogger(__name__)

# Segment length fixed by model architecture
SEGMENT_SAMPLES = 343980  # 343980 / 44100 ≈ 7.8 s
SR = 44100
# Spectrogram params (from model input shape)
N_FFT = 4096
HOP = 1024
SPEC_FREQ = 2048
SPEC_TIME = 336

# Model paths (embedded and htdemucs.onnx share same I/O as 4-stem two-input)
EMBEDDED_ONNX = MODELS_DIR / "htdemucs_embedded.onnx"
HTDEMUCS_ONNX = MODELS_DIR / "htdemucs.onnx"  # fallback when embedded missing
SIX_STEM_ONNX = MODELS_DIR / "htdemucs_6s.onnx"
V4_ONNX = MODELS_DIR / "demucsv4.onnx"

# Stem order from model output (index → name)
STEM_ORDER_4 = ("drums", "bass", "other", "vocals")
STEM_ORDER_6 = ("drums", "bass", "other", "vocals", "guitar", "piano")
# API return order
RETURN_ORDER = ("vocals", "drums", "bass", "other")

_session_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


def _get_session(path: Path) -> Any | None:
    key = str(path.resolve())
    with _cache_lock:
        if key in _session_cache:
            return _session_cache[key]
    try:
        import onnxruntime as ort
        import os

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        n = os.environ.get("ONNXRUNTIME_NUM_THREADS", "")
        if n.isdigit() and int(n) >= 0:
            opts.intra_op_num_threads = int(n)
        sess = ort.InferenceSession(
            str(path), sess_options=opts, providers=get_onnx_providers()
        )
        with _cache_lock:
            _session_cache[key] = sess
        logger.info("Demucs ONNX session cached: %s", path.name)
        return sess
    except Exception as e:
        logger.warning("Failed to load Demucs ONNX %s: %s", path.name, e)
        return None


def _build_spec(waveform: np.ndarray) -> np.ndarray:
    """
    Build spectrogram input (1, 4, SPEC_FREQ, SPEC_TIME) from waveform (1, 2, N).
    Channels: [L_real, L_imag, R_real, R_imag].
    """
    import torch

    w = torch.from_numpy(waveform[0])  # (2, N)
    pad_to = SPEC_TIME * HOP  # 344064
    if w.shape[-1] < pad_to:
        w = torch.nn.functional.pad(w, (0, pad_to - w.shape[-1]))
    else:
        w = w[..., :pad_to]

    kw = dict(
        n_fft=N_FFT,
        hop_length=HOP,
        win_length=N_FFT,
        window=torch.hann_window(N_FFT),
        return_complex=True,
        center=False,
    )
    sl = torch.stft(w[0], **kw)
    sr = torch.stft(w[1], **kw)
    spec = torch.stack([sl.real, sl.imag, sr.real, sr.imag], dim=0).unsqueeze(0)
    # (1, 4, freq, time) — slice/pad to exact shape
    spec = spec[:, :, :SPEC_FREQ, :]
    t = spec.shape[3]
    if t < SPEC_TIME:
        spec = torch.nn.functional.pad(spec, (0, SPEC_TIME - t))
    elif t > SPEC_TIME:
        spec = spec[:, :, :, :SPEC_TIME]
    return spec.float().numpy()


def _overlap_add(
    chunks: list[tuple[int, int, np.ndarray]],
    total: int,
) -> np.ndarray:
    """
    Hann-windowed overlap-add (OLA) for a single stem.
    Chunks are weighted by a Hann window before summing; we normalize by the
    sum of window weights so overlap regions blend smoothly and avoid
    amplitude modulation artifacts at chunk boundaries (~3.9 s).
    chunks: [(start, end, wav)].
    """
    out = np.zeros((2, total), dtype=np.float32)
    cnt = np.zeros((2, total), dtype=np.float32)
    seg = SEGMENT_SAMPLES
    win = np.hanning(seg).astype(np.float32)
    for start, end, wav in chunks:
        length = end - start
        w = win[:length]
        out[:, start:end] += wav[:, :length] * w
        cnt[:, start:end] += w
    return out / np.maximum(cnt, 1e-8)


def _demucs_model_config(path: Path) -> tuple[str, int, bool] | None:
    """Infer (wav_out_name, n_stems, two_input) from model path name. Returns None if unknown."""
    name = path.name.lower()
    if "6s" in name or "6_s" in name:
        return "5012", 6, True
    if "embedded" in name or path.name == "htdemucs.onnx":
        return "add_67", 4, True
    if "demucsv4" in name or "v4" in name:
        return "output", 6, False
    # Default: assume two-input 4-stem (embedded-style)
    return "add_67", 4, True


def run_demucs_onnx_4stem(
    input_path: Path,
    output_dir: Path,
    use_6s: bool = False,
    demucs_model_override: Path | None = None,
) -> tuple[list[tuple[str, Path]], str] | tuple[None, None]:
    """
    Single-pass 4-stem separation.
    use_6s=True  → htdemucs_6s.onnx  (quality; "other" = model's other stem only; guitar/piano dropped)
    use_6s=False → htdemucs_embedded.onnx (speed)
    demucs_model_override: when set, use this path and infer I/O from filename (for benchmarking).
    Returns (stem_list, model_name) on success, (None, None) on failure.
    """
    import soundfile as sf
    import torch

    # Override: use given path and infer config from filename
    if demucs_model_override is not None and demucs_model_override.exists():
        cfg = _demucs_model_config(demucs_model_override)
        if cfg is None:
            return None, None
        wav_out_name, n_stems, two_input = cfg
        model_path = demucs_model_override
    else:
        # Pick model (prefer ONNX so we avoid Demucs subprocess)
        if use_6s and SIX_STEM_ONNX.exists():
            model_path = SIX_STEM_ONNX
            wav_out_name = "5012"
            n_stems = 6
            two_input = True
        elif not use_6s and EMBEDDED_ONNX.exists():
            model_path = EMBEDDED_ONNX
            wav_out_name = "add_67"
            n_stems = 4
            two_input = True
        elif not use_6s and HTDEMUCS_ONNX.exists():
            model_path = HTDEMUCS_ONNX
            wav_out_name = "add_67"
            n_stems = 4
            two_input = True
            logger.info("Demucs ONNX: using htdemucs.onnx (embedded fallback)")
        elif V4_ONNX.exists():
            model_path = V4_ONNX
            wav_out_name = "output"
            n_stems = 6
            two_input = False
            logger.info("Demucs ONNX: using demucsv4.onnx (single-input fallback)")
        else:
            return None, None

    session = _get_session(model_path)
    if session is None:
        return None, None

    # Discover input names from session
    inp_names = [i.name for i in session.get_inputs()]
    wav_input_name = inp_names[0]  # always 'input'
    spec_input_name = inp_names[1] if two_input and len(inp_names) > 1 else None

    # Load audio
    try:
        mix, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    except Exception as e:
        logger.warning("demucs_onnx: cannot read %s: %s", input_path, e)
        return None, None

    if mix.shape[1] == 1:
        mix = np.concatenate([mix, mix], axis=1)
    elif mix.shape[1] > 2:
        mix = mix[:, :2]

    if sr != SR:
        import torchaudio

        mix_t = torch.from_numpy(mix.T).unsqueeze(0).float()
        mix_t = torchaudio.functional.resample(mix_t, sr, SR)
        mix = mix_t.squeeze(0).numpy().T

    # (samples, 2) → (1, 2, samples)
    mix_t = torch.from_numpy(mix.T.astype(np.float32)).unsqueeze(0)
    total = mix_t.shape[2]
    seg = SEGMENT_SAMPLES
    hop = seg // 2  # 50% overlap

    # Per-stem chunk accumulator: list of (start, end, wav_array)
    stem_chunks: list[list[tuple[int, int, np.ndarray]]] = [[] for _ in range(4)]

    pos = 0
    while pos < total:
        end = min(pos + seg, total)
        chunk_len = end - pos
        chunk = mix_t[:, :, pos:end]
        if chunk_len < seg:
            chunk = torch.nn.functional.pad(chunk, (0, seg - chunk_len))

        chunk_np = chunk.numpy()

        if two_input:
            spec_np = _build_spec(chunk_np)
            feed = {wav_input_name: chunk_np, spec_input_name: spec_np}
        else:
            feed = {wav_input_name: chunk_np}

        try:
            raw_outputs = session.run(None, feed)
        except Exception as e:
            logger.warning("demucs_onnx: inference failed: %s", e)
            return None, None

        # Find the waveform output by name, then by shape
        wav_out = None
        for i, out_info in enumerate(session.get_outputs()):
            if out_info.name == wav_out_name:
                wav_out = raw_outputs[i]
                break
        if wav_out is None:
            # Fallback: find output with shape (1, n_stems, 2, N)
            for arr in raw_outputs:
                if arr.ndim == 4 and arr.shape[2] == 2:
                    wav_out = arr
                    break
        if wav_out is None:
            logger.warning("demucs_onnx: cannot find waveform output")
            return None, None

        # wav_out: (1, n_stems, 2, seg)
        stems_raw = wav_out[0]  # (n_stems, 2, seg)

        # Map to 4 stems: drums, bass, other, vocals
        if n_stems == 6:
            # Use model's "other" (index 2) only; do not fold guitar(4)/piano(5) into it
            # to avoid a louder, muddier "other" stem. Guitar and piano are dropped
            # for the 4-stem API; use 4-stem embedded model if you need a single "other".
            out4 = np.stack(
                [
                    stems_raw[0],
                    stems_raw[1],
                    stems_raw[2].copy(),
                    stems_raw[3],
                ],
                axis=0,
            )
        else:
            out4 = stems_raw[:4]

        for i in range(4):
            stem_chunks[i].append((pos, end, out4[i][:, :chunk_len].copy()))

        pos += hop
        if chunk_len < seg:
            break

    # Overlap-add per stem
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    stem_wavs = {STEM_ORDER_4[i]: _overlap_add(stem_chunks[i], total) for i in range(4)}

    result: list[tuple[str, Path]] = []
    for stem_id in RETURN_ORDER:
        wav = stem_wavs[stem_id]
        out_path = output_dir / f"{stem_id}.wav"
        sf.write(str(out_path), wav.T, TARGET_SAMPLE_RATE, subtype="PCM_16")
        result.append((stem_id, out_path))

    return result, model_path.name


def demucs_onnx_embedded_available() -> bool:
    """True if 4-stem speed ONNX available (embedded or htdemucs.onnx)."""
    return EMBEDDED_ONNX.exists() or HTDEMUCS_ONNX.exists()


def demucs_onnx_6s_available() -> bool:
    return SIX_STEM_ONNX.exists()


def demucs_onnx_v4_available() -> bool:
    return V4_ONNX.exists()
