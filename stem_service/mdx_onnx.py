"""
MDX-Net ONNX inference for vocal and instrumental separation.

Hardcoded configs derived from probing actual model tensor shapes (scripts/probe_onnx.py)
and cross-referencing UVR model_data.json for n_fft and hop_length.

Key insight: hop_length is ALWAYS 1024 in UVR/MDX-Net — it is NOT n_fft//2.

Vocal models  (primary_stem=Vocals):
  Kim_Vocal_2.onnx, UVR-MDX-NET-Voc_FT.onnx
  Input:  (batch, 4, 3072, 256)  n_fft=6144  hop=1024  dim_f=3072  dim_t=256

Instrumental models (primary_stem=Instrumental):
  UVR-MDX-NET-Inst_HQ_4.onnx, UVR-MDX-NET-Inst_HQ_5.onnx
  Input:  (batch, 4, 2560, 256)  n_fft=5120  hop=1024  dim_f=2560  dim_t=256
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

from stem_service.config import MDXNET_MODELS_DIR, MODELS_DIR, get_onnx_providers

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardcoded model configs (derived from tensor shapes + UVR model_data.json)
# ---------------------------------------------------------------------------
# Each entry: (n_fft, hop_length, dim_f, dim_t, compensate)
#
# IMPORTANT: hop_length is ALWAYS 1024 in UVR/MDX-Net — it is NOT n_fft//2.
# n_fft determines the frequency resolution; hop is fixed at 1024.
#
# dim_f = freq bins fed to model (first dim_f bins of STFT output)
# n_fft must satisfy: n_fft//2 + 1 >= dim_f
#   Kim_Vocal_2 / Voc_FT:  dim_f=3072 → n_fft=6144 (6144//2+1=3073 ≥ 3072 ✓)
#   Inst_HQ_4 / Inst_HQ_5: dim_f=2560 → n_fft=5120 (5120//2+1=2561 ≥ 2560 ✓)
#
# compensate: post-iSTFT amplitude correction factor (from UVR model_data.json)
_MDX_CONFIGS: dict[str, tuple[int, int, int, int, float]] = {
    #                                    n_fft   hop   dim_f  dim_t  compensate
    "Kim_Vocal_2.onnx":                 (6144,  1024,  3072,  256,   1.035),
    "UVR-MDX-NET-Voc_FT.onnx":         (6144,  1024,  3072,  256,   1.035),
    "UVR-MDX-NET-Inst_HQ_4.onnx":      (5120,  1024,  2560,  256,   1.035),
    "UVR-MDX-NET-Inst_HQ_5.onnx":      (5120,  1024,  2560,  256,   1.035),
    # De-reverb model: same n_fft/dim_f as Kim, but dim_t=512 (longer context window)
    # primary_stem=Reverb — output is the reverb component; subtract from input for dry signal
    "Reverb_HQ_By_FoxJoy.onnx":        (6144,  1024,  3072,  512,   1.0),
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

DEREVERB_MODEL_PATHS: list[Path] = [
    MDXNET_MODELS_DIR / "Reverb_HQ_By_FoxJoy.onnx",
    MODELS_DIR / "Reverb_HQ_By_FoxJoy.onnx",
]

# ---------------------------------------------------------------------------
# Session cache
# ---------------------------------------------------------------------------
_session_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


def _get_config(model_path: Path) -> tuple[int, int, int, int, float] | None:
    """Return (n_fft, hop, dim_f, dim_t, compensate) for a model, or None if unknown."""
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


def get_available_dereverb_onnx() -> Path | None:
    """Return first existing de-reverb ONNX path."""
    for path in DEREVERB_MODEL_PATHS:
        if path.exists():
            return path
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
        logger.info(
            "ONNX session cached: %s (providers: %s)",
            model_path.name,
            sess.get_providers(),
        )
        return sess
    except Exception as e:
        logger.warning("Failed to load ONNX session %s: %s", model_path.name, e)
        return None


def _stft(wav: "torch.Tensor", n_fft: int, hop: int, dim_f: int) -> "torch.Tensor":
    """
    STFT matching the UVR/audio-separator reference (center=True, return_complex=False).
    Input:  (batch, 2, samples)
    Output: (batch, 4, dim_f, time_frames)  — [L_real, L_imag, R_real, R_imag], freq truncated to dim_f
    """
    import torch

    window = torch.hann_window(n_fft, periodic=True)
    batch_dims = wav.shape[:-2]
    channels, time_dim = wav.shape[-2], wav.shape[-1]
    reshaped = wav.reshape([-1, time_dim])

    stft_out = torch.stft(
        reshaped,
        n_fft=n_fft,
        hop_length=hop,
        window=window,
        center=True,
        return_complex=False,
    )  # (batch*2, freq, time, 2)

    # permute → (batch*2, 2, freq, time) then reshape → (batch, 4, freq, time)
    perm = stft_out.permute([0, 3, 1, 2])
    out = perm.reshape([*batch_dims, channels, 2, -1, perm.shape[-1]])
    out = out.reshape([*batch_dims, channels * 2, -1, perm.shape[-1]])
    return out[..., :dim_f, :]  # truncate to dim_f freq bins


def _istft(spec: "torch.Tensor", n_fft: int, hop: int) -> "torch.Tensor":
    """
    iSTFT matching the UVR reference.
    Input:  (batch, 4, dim_f, time_frames)  — [L_real, L_imag, R_real, R_imag]
    Output: (batch, 2, samples)
    """
    import torch

    window = torch.hann_window(n_fft, periodic=True)
    batch_dims = spec.shape[:-3]
    channel_dim, freq_dim, time_dim = spec.shape[-3], spec.shape[-2], spec.shape[-1]
    n_bins = n_fft // 2 + 1

    # Pad freq back to n_bins
    if freq_dim < n_bins:
        pad = torch.zeros([*batch_dims, channel_dim, n_bins - freq_dim, time_dim])
        spec = torch.cat([spec, pad], dim=-2)

    # Reshape to separate real/imag and channels
    reshaped = spec.reshape([*batch_dims, channel_dim // 2, 2, n_bins, time_dim])
    flat = reshaped.reshape([-1, 2, n_bins, time_dim])
    perm = flat.permute([0, 2, 3, 1])  # (batch*2, n_bins, time, 2)
    cplx = perm[..., 0] + perm[..., 1] * 1j

    result = torch.istft(cplx, n_fft=n_fft, hop_length=hop, window=window, center=True)
    return result.reshape([*batch_dims, 2, -1])


def _run_mdx_onnx(
    input_path: Path,
    output_path: Path,
    model_path: Path,
    overlap: float = 0.75,
    job_logger: "logging.Logger | None" = None,
) -> Path | None:
    """
    Core MDX-Net ONNX inference following the UVR5 / audio-separator reference exactly.

    The model takes a spectrogram chunk (batch, 4, dim_f, dim_t) and outputs a
    separated spectrogram of the same shape. The output is fed directly to iSTFT —
    there is no explicit mask multiplication step; the network learns to output the
    separated spectrogram directly.

    Chunking follows the UVR reference:
      chunk_size = hop * (segment_size - 1)
      gen_size   = chunk_size - 2 * trim          (trim = n_fft // 2)
      Each chunk has trim-sample zero-padding on each side.
      Overlap-add uses a Hann window on the gen_size region only.

    overlap: fraction of gen_size used as overlap between consecutive chunks.
             0.5 = faster, 0.75 = smoother boundaries (recommended for quality).
    job_logger: optional per-job logger for detailed progress tracing.
    """
    import time

    import numpy as np
    import soundfile as sf
    import torch

    _log = job_logger or logger
    t_start = time.monotonic()

    cfg = _get_config(model_path)
    if cfg is None:
        _log.warning("No config for %s — cannot run inference", model_path.name)
        return None

    n_fft, hop, dim_f, dim_t, compensate = cfg

    session = _onnx_session(model_path)
    if session is None:
        return None

    _log.info(
        "mdx_onnx: running %s on %s (overlap=%.0f%%)",
        model_path.name,
        input_path.name,
        overlap * 100,
    )
    input_name = session.get_inputs()[0].name
    try:
        mix, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    except Exception as e:
        _log.warning("mdx_onnx: cannot read %s: %s", input_path, e)
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
    mix_np = mix.T.astype(np.float32)
    n_samples = mix_np.shape[1]
    duration_s = n_samples / 44100.0

    # ── UVR chunking parameters ───────────────────────────────────────────────
    trim = n_fft // 2
    chunk_size = hop * (dim_t - 1)
    gen_size = chunk_size - 2 * trim

    overlap = max(0.001, min(0.999, overlap))
    step = int((1.0 - overlap) * chunk_size)

    # Pad: trim zeros at start, then enough to make length a multiple of gen_size, then trim zeros at end
    pad = gen_size + trim - (n_samples % gen_size)
    mixture = np.concatenate(
        [
            np.zeros((2, trim), dtype=np.float32),
            mix_np,
            np.zeros((2, pad), dtype=np.float32),
        ],
        axis=1,
    )
    total = mixture.shape[1]
    n_chunks = max(1, (total + step - 1) // step)

    _log.info(
        "mdx_onnx: audio=%.1fs  n_fft=%d  hop=%d  chunk_size=%d  step=%d  "
        "n_chunks=%d  overlap=%.0f%%",
        duration_s, n_fft, hop, chunk_size, step, n_chunks, overlap * 100,
    )

    result = np.zeros((1, 2, total), dtype=np.float32)
    divider = np.zeros((1, 2, total), dtype=np.float32)

    # ── Process chunks ────────────────────────────────────────────────────────
    chunk_idx = 0
    for i in range(0, total, step):
        chunk_idx += 1
        if chunk_idx % 10 == 0 or chunk_idx == 1:
            elapsed = time.monotonic() - t_start
            _log.info(
                "mdx_onnx: chunk %d/%d  elapsed=%.1fs",
                chunk_idx, n_chunks, elapsed,
            )

        start = i
        end = min(i + chunk_size, total)
        chunk_size_actual = end - start

        # Hann window for overlap-add
        window = np.hanning(chunk_size_actual).astype(np.float32)
        window = np.tile(window[None, None, :], (1, 2, 1))

        # Extract chunk, zero-pad if short
        mix_part = mixture[:, start:end]
        if end != i + chunk_size:
            pad_size = (i + chunk_size) - end
            mix_part = np.concatenate(
                [mix_part, np.zeros((2, pad_size), dtype=np.float32)], axis=-1
            )

        # (2, chunk_size) → (1, 2, chunk_size) tensor
        mix_tensor = torch.tensor(mix_part[np.newaxis], dtype=torch.float32)

        # STFT → (1, 4, dim_f, dim_t)
        spek = _stft(mix_tensor, n_fft, hop, dim_f)

        # Zero out first 3 freq bins (UVR reference does this to reduce low-freq noise)
        spek[:, :, :3, :] = 0.0

        # Run ONNX model
        try:
            spec_pred = session.run(None, {input_name: spek.numpy()})[0]
        except Exception as e:
            _log.warning("mdx_onnx: session.run failed at chunk %d: %s", chunk_idx, e)
            return None

        # iSTFT → (1, 2, samples)
        wav_out = _istft(
            torch.tensor(spec_pred, dtype=torch.float32), n_fft, hop
        ).numpy()

        # Overlap-add with Hann window
        result[..., start:end] += wav_out[..., : end - start] * window
        divider[..., start:end] += window

    elapsed_total = time.monotonic() - t_start
    _log.info(
        "mdx_onnx: finished %d chunks in %.1fs (%.2fs/chunk)",
        chunk_idx, elapsed_total, elapsed_total / max(chunk_idx, 1),
    )

    # ── Reconstruct ───────────────────────────────────────────────────────────
    tar_waves = result / np.maximum(divider, 1e-8)
    # Trim padding and restore original length (UVR: [trim:-trim] then [:n_samples])
    tar_waves = tar_waves[:, :, trim:-trim]
    source = tar_waves[0, :, :n_samples]  # (2, n_samples)

    out_wav = (source * compensate).T  # (n_samples, 2)
    out_wav = np.clip(out_wav, -1.0, 1.0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), out_wav, 44100, subtype="PCM_16")
    _log.info("mdx_onnx: wrote %s (%s)", output_path.name, model_path.name)
    return output_path


def run_vocal_onnx(
    input_path: Path,
    output_path: Path,
    segment_size: int = 256,  # kept for API compat; dim_t is from model config
    overlap: float = 0.75,
    job_logger: "logging.Logger | None" = None,
    model_path_override: Path | None = None,
) -> Path | None:
    """
    Extract vocals using the best available vocal ONNX model (or model_path_override when set).
    overlap: 0.5 for speed, 0.75 for quality (smoother chunk boundaries).
    Returns output_path on success, None if no model or inference fails.
    """
    model_path = model_path_override if model_path_override is not None else get_available_vocal_onnx()
    if model_path is None or not model_path.exists():
        logger.debug("No vocal ONNX model found")
        return None
    return _run_mdx_onnx(input_path, output_path, model_path, overlap=overlap, job_logger=job_logger)


def run_inst_onnx(
    input_path: Path,
    output_path: Path,
    overlap: float = 0.75,
    job_logger: "logging.Logger | None" = None,
    model_path_override: Path | None = None,
) -> Path | None:
    """
    Extract instrumental using the best available instrumental ONNX model (or model_path_override when set).
    overlap: 0.5 for speed, 0.75 for quality (smoother chunk boundaries).
    Returns output_path on success, None if no model or inference fails.
    This avoids phase inversion artifacts when available.
    """
    model_path = model_path_override if model_path_override is not None else get_available_inst_onnx()
    if model_path is None or not model_path.exists():
        logger.debug("No instrumental ONNX model found")
        return None
    return _run_mdx_onnx(input_path, output_path, model_path, overlap=overlap, job_logger=job_logger)


def run_dereverb_onnx(
    input_path: Path,
    output_path: Path,
    overlap: float = 0.75,
    job_logger: "logging.Logger | None" = None,
) -> Path | None:
    """
    Remove reverb/room resonance from a vocal stem using Reverb_HQ_By_FoxJoy.

    The model outputs the reverb component (what to remove). We subtract it from
    the input to produce a dry, clean vocal. This is the post-processing step
    recommended after Kim Vocal 2 extraction.

    overlap: 0.5 for speed, 0.75 for quality.
    Returns output_path on success, None if model unavailable or inference fails.
    """
    import numpy as np
    import soundfile as sf

    _log = job_logger or logger
    model_path = get_available_dereverb_onnx()
    if model_path is None:
        logger.debug("No de-reverb ONNX model found — skipping reverb removal")
        return None

    # Run model to get the reverb component
    reverb_path = output_path.parent / "_reverb_component.wav"
    reverb_result = _run_mdx_onnx(
        input_path, reverb_path, model_path, overlap=overlap, job_logger=job_logger
    )
    if reverb_result is None:
        return None

    # dry = input - reverb_component
    try:
        wet, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
        reverb, _ = sf.read(str(reverb_path), dtype="float32", always_2d=True)

        # Align lengths (reverb output may differ by a few samples)
        min_len = min(len(wet), len(reverb))
        dry = wet[:min_len] - reverb[:min_len]
        dry = np.clip(dry, -1.0, 1.0)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), dry, sr, subtype="PCM_16")
        _log.info("dereverb: wrote dry vocal %s", output_path.name)

        # Clean up intermediate file
        reverb_path.unlink(missing_ok=True)
        return output_path
    except Exception as e:
        _log.warning("dereverb: subtraction failed: %s", e)
        return None
