"""
MDX-Net ONNX inference for vocal and instrumental separation.

Hardcoded configs derived from probing actual model tensor shapes (scripts/probe_onnx.py).
No model_data.json hash lookup needed — shapes are deterministic per model file.

Vocal models  (primary_stem=Vocals):
  Kim_Vocal_2.onnx, UVR-MDX-NET-Voc_FT.onnx
  Input:  (batch, 4, 3072, 256)  n_fft=6144  hop=3072  compensate=1.035

Instrumental models (primary_stem=Instrumental):
  UVR-MDX-NET-Inst_HQ_4.onnx, UVR-MDX-NET-Inst_HQ_5.onnx
  Input:  (batch, 4, 2560, 256)  n_fft=5120  hop=2560  compensate=1.035
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

from stem_service.config import MDXNET_MODELS_DIR, MODELS_DIR, get_onnx_providers

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardcoded model configs (derived from tensor shapes, not model_data.json)
# ---------------------------------------------------------------------------
# Each entry: (n_fft, dim_f, dim_t, compensate)
# dim_f = freq bins in model input = n_fft // 2  (NOT n_fft//2+1)
# hop   = n_fft // 2
_MDX_CONFIGS: dict[str, tuple[int, int, int, float]] = {
    "Kim_Vocal_2.onnx": (6144, 3072, 256, 1.035),
    "UVR-MDX-NET-Voc_FT.onnx": (6144, 3072, 256, 1.035),
    "UVR-MDX-NET-Inst_HQ_4.onnx": (5120, 2560, 256, 1.035),
    "UVR-MDX-NET-Inst_HQ_5.onnx": (5120, 2560, 256, 1.035),
}

# ---------------------------------------------------------------------------
# Model path lists — first existing file wins
# ---------------------------------------------------------------------------
VOCAL_MODEL_PATHS: list[Path] = [
    MDXNET_MODELS_DIR / "Kim_Vocal_2.onnx",
    MODELS_DIR / "Kim_Vocal_2.onnx",
    MDXNET_MODELS_DIR / "UVR-MDX-NET-Voc_FT.onnx",
    MODELS_DIR / "UVR-MDX-NET-Voc_FT.onnx",
    MODELS_DIR / "MDX_Net_Models" / "Kim_Vocal_2.onnx",
    MODELS_DIR / "MDX_Net_Models" / "UVR-MDX-NET-Voc_FT.onnx",
]

INST_MODEL_PATHS: list[Path] = [
    MDXNET_MODELS_DIR / "UVR-MDX-NET-Inst_HQ_4.onnx",
    MODELS_DIR / "UVR-MDX-NET-Inst_HQ_4.onnx",
    MDXNET_MODELS_DIR / "UVR-MDX-NET-Inst_HQ_5.onnx",
    MODELS_DIR / "UVR-MDX-NET-Inst_HQ_5.onnx",
    MODELS_DIR / "MDX_Net_Models" / "UVR-MDX-NET-Inst_HQ_5.onnx",
]

# ---------------------------------------------------------------------------
# Session cache
# ---------------------------------------------------------------------------
_session_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


def _get_config(model_path: Path) -> tuple[int, int, int, float] | None:
    """Return (n_fft, dim_f, dim_t, compensate) for a model, or None if unknown."""
    return _MDX_CONFIGS.get(model_path.name)


def _prefer_quantized(path: Path) -> Path:
    """Return .quant.onnx sibling when USE_INT8_ONNX is enabled and file exists."""
    import os

    if os.environ.get("USE_INT8_ONNX", "1").strip().lower() in ("0", "false", "no"):
        return path
    quant = path.parent / f"{path.stem}.quant.onnx"
    return quant if quant.exists() else path


def get_available_vocal_onnx() -> Path | None:
    """Return first existing vocal ONNX path (prefer .quant.onnx when present)."""
    for path in VOCAL_MODEL_PATHS:
        if path.exists():
            return _prefer_quantized(path)
    return None


def get_available_inst_onnx() -> Path | None:
    """Return first existing instrumental ONNX path (prefer .quant.onnx when present)."""
    for path in INST_MODEL_PATHS:
        if path.exists():
            return _prefer_quantized(path)
    return None


def _onnx_session(model_path: Path) -> Any | None:
    """Get or create a cached ONNX InferenceSession."""
    import os

    cache_key = str(model_path.resolve())
    with _cache_lock:
        if cache_key in _session_cache:
            return _session_cache[cache_key]
    try:
        import onnxruntime as ort
    except ImportError:
        logger.warning("onnxruntime not installed")
        return None
    try:
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        n = os.environ.get("ONNXRUNTIME_NUM_THREADS", "")
        if n.isdigit() and int(n) >= 0:
            opts.intra_op_num_threads = int(n)
        sess = ort.InferenceSession(
            str(model_path),
            sess_options=opts,
            providers=get_onnx_providers(),
        )
        with _cache_lock:
            _session_cache[cache_key] = sess
        logger.info("ONNX session cached: %s", model_path.name)
        return sess
    except Exception as e:
        logger.warning("Failed to load ONNX session %s: %s", model_path.name, e)
        return None


def _run_mdx_onnx(
    input_path: Path,
    output_path: Path,
    model_path: Path,
) -> Path | None:
    """
    Core MDX-Net ONNX inference. Works for both vocal and instrumental models.
    Writes the primary stem to output_path. Returns output_path on success, None on failure.

    Algorithm:
      - STFT the input into (batch, 4, dim_f, dim_t) real/imag chunks
      - Run ONNX → get mask output same shape
      - iSTFT back to waveform
      - Overlap-add with Hann window for smooth chunk boundaries
    """
    import numpy as np
    import soundfile as sf
    import torch

    cfg = _get_config(model_path)
    if cfg is None:
        logger.warning("No config for %s — cannot run inference", model_path.name)
        return None

    n_fft, dim_f, dim_t, compensate = cfg
    hop = n_fft // 2

    session = _onnx_session(model_path)
    if session is None:
        return None

    input_name = session.get_inputs()[0].name

    # Load audio → stereo float32 at 44100 Hz
    try:
        mix, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    except Exception as e:
        logger.warning("mdx_onnx: cannot read %s: %s", input_path, e)
        return None

    if mix.shape[1] == 1:
        mix = np.concatenate([mix, mix], axis=1)
    elif mix.shape[1] > 2:
        mix = mix[:, :2]

    if sr != 44100:
        import torchaudio

        mix_t = torch.from_numpy(mix.T).unsqueeze(0).float()
        mix_t = torchaudio.functional.resample(mix_t, sr, 44100)
        mix = mix_t.squeeze(0).numpy().T
        sr = 44100

    # (samples, 2) → (2, samples)
    mix = mix.T.astype(np.float32)
    n_samples = mix.shape[1]

    # Chunk size in samples: hop * (dim_t - 1) with trim padding
    trim = n_fft // 2
    chunk_samples = hop * (dim_t - 1)
    # Step between chunks (overlap = 0.5 of chunk for smooth OLA)
    step = chunk_samples // 2

    # Pad mix: trim on left, enough on right for last chunk
    pad_right = step - (n_samples % step) if n_samples % step != 0 else 0
    pad_right += step  # extra buffer
    mixture = np.concatenate(
        [
            np.zeros((2, trim), dtype=np.float32),
            mix,
            np.zeros((2, pad_right + trim), dtype=np.float32),
        ],
        axis=1,
    )
    total = mixture.shape[1]

    result = np.zeros((2, total), dtype=np.float32)
    weight = np.zeros((2, total), dtype=np.float32)
    hann = np.hanning(chunk_samples).astype(np.float32)
    hann2d = np.broadcast_to(hann[np.newaxis, :], (2, chunk_samples)).copy()

    stft_kw = dict(
        n_fft=n_fft,
        hop_length=hop,
        win_length=n_fft,
        window=torch.hann_window(n_fft),
        return_complex=True,
    )

    pos = 0
    while pos < total:
        end = min(pos + chunk_samples, total)
        chunk_len = end - pos
        chunk = mixture[:, pos:end]
        if chunk_len < chunk_samples:
            chunk = np.pad(chunk, ((0, 0), (0, chunk_samples - chunk_len)))

        mix_t = torch.from_numpy(chunk)  # (2, chunk_samples)

        # STFT per channel → complex (n_fft//2+1, frames)
        sl = torch.stft(mix_t[0], **stft_kw)
        sr_t = torch.stft(mix_t[1], **stft_kw)

        # Stack real/imag → (1, 4, n_bins, frames)
        spec = torch.stack([sl.real, sl.imag, sr_t.real, sr_t.imag], dim=0).unsqueeze(
            0
        )  # (1, 4, n_bins, frames)

        n_bins_actual = spec.shape[2]
        n_frames = spec.shape[3]

        # Slice/pad freq to dim_f, time to dim_t
        if n_bins_actual > dim_f:
            spec = spec[:, :, :dim_f, :]
        elif n_bins_actual < dim_f:
            spec = torch.nn.functional.pad(spec, (0, 0, 0, dim_f - n_bins_actual))

        if n_frames > dim_t:
            spec = spec[:, :, :, :dim_t]
        elif n_frames < dim_t:
            spec = torch.nn.functional.pad(spec, (0, dim_t - n_frames))

        feed = spec.float().numpy()  # (1, 4, dim_f, dim_t)

        try:
            out = session.run(None, {input_name: feed})[0]  # (1, 4, dim_f, dim_t)
        except Exception as e:
            logger.warning("mdx_onnx: session.run failed: %s", e)
            return None

        # Reconstruct complex spectrogram from real/imag output
        out_t = torch.from_numpy(out[0])  # (4, dim_f, dim_t)
        # Channels 0,1 = left real/imag; 2,3 = right real/imag
        spec_l = torch.complex(out_t[0, :, :n_frames], out_t[1, :, :n_frames])
        spec_r = torch.complex(out_t[2, :, :n_frames], out_t[3, :, :n_frames])

        # Pad freq back to n_fft//2+1 for iSTFT
        n_bins_full = n_fft // 2 + 1
        if spec_l.shape[0] < n_bins_full:
            pad_bins = n_bins_full - spec_l.shape[0]
            spec_l = torch.nn.functional.pad(spec_l, (0, 0, 0, pad_bins))
            spec_r = torch.nn.functional.pad(spec_r, (0, 0, 0, pad_bins))

        istft_kw = dict(
            n_fft=n_fft,
            hop_length=hop,
            win_length=n_fft,
            window=torch.hann_window(n_fft),
            length=chunk_samples,
        )
        wav_l = torch.istft(spec_l.unsqueeze(0), **istft_kw).squeeze(0)
        wav_r = torch.istft(spec_r.unsqueeze(0), **istft_kw).squeeze(0)
        wav = torch.stack([wav_l, wav_r], dim=0).numpy()  # (2, chunk_samples)

        # Overlap-add with Hann window
        w = hann2d[:, :chunk_len]
        result[:, pos:end] += wav[:, :chunk_len] * w
        weight[:, pos:end] += w

        pos += step
        if end >= total:
            break

    # Normalize by accumulated window weight
    out_wav = result / np.maximum(weight, 1e-8)
    # Trim padding and restore original length
    out_wav = out_wav[:, trim : trim + n_samples]
    out_wav = (out_wav * compensate).T  # (n_samples, 2)
    out_wav = np.clip(out_wav, -1.0, 1.0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), out_wav, 44100, subtype="PCM_16")
    logger.info("mdx_onnx: wrote %s (%s)", output_path.name, model_path.name)
    return output_path


def run_vocal_onnx(
    input_path: Path,
    output_path: Path,
    segment_size: int = 256,  # kept for API compat; dim_t is from model config
    overlap: int = 2,  # kept for API compat
) -> Path | None:
    """
    Extract vocals using the best available vocal ONNX model.
    Returns output_path on success, None if no model or inference fails.
    """
    model_path = get_available_vocal_onnx()
    if model_path is None:
        logger.debug("No vocal ONNX model found")
        return None
    return _run_mdx_onnx(input_path, output_path, model_path)


def run_inst_onnx(
    input_path: Path,
    output_path: Path,
) -> Path | None:
    """
    Extract instrumental using the best available instrumental ONNX model.
    Returns output_path on success, None if no model or inference fails.
    This avoids phase inversion artifacts when available.
    """
    model_path = get_available_inst_onnx()
    if model_path is None:
        logger.debug("No instrumental ONNX model found")
        return None
    return _run_mdx_onnx(input_path, output_path, model_path)
