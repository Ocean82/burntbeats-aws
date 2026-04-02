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
    "Kim_Vocal_1.onnx":                 (6144,  1024,  3072,  256,   1.035),
    "Kim_Vocal_2.onnx":                 (6144,  1024,  3072,  256,   1.035),
    "Kim_Inst.onnx":                    (6144,  1024,  3072,  256,   1.035),
    "UVR-MDX-NET-Voc_FT.onnx":         (6144,  1024,  3072,  256,   1.035),
    "UVR-MDX-NET-Inst_HQ_4.onnx":      (5120,  1024,  2560,  256,   1.035),
    "UVR-MDX-NET-Inst_HQ_5.onnx":      (5120,  1024,  2560,  256,   1.035),
    "UVR-MDX-NET_Crowd_HQ_1.onnx":     (5120,  1024,  2560,  256,   1.035),
    # MDX23C 2-stem (MDX23C vocal/instrumental ONNX)
    "mdx23c_vocal.onnx":              (6144,  1024,  3072,  256,   1.035),
    "mdx23c_instrumental.onnx":      (6144,  1024,  3072,  256,   1.035),
    # Speed 2-stem default (models/model_int8.onnx): UVR/MDX int8 export — same I/O as Kim vocal when MDX-shaped
    "model_int8.onnx":               (6144,  1024,  3072,  256,   1.035),
    # De-reverb model: same n_fft/dim_f as Kim, but dim_t=512 (longer context window)
    # primary_stem=Reverb — output is the reverb component; subtract from input for dry signal
    "Reverb_HQ_By_FoxJoy.onnx":        (6144,  1024,  3072,  512,   1.0),
    # UVR MDX-Net numbered exports — probed [batch,4,2048,256] → n_fft=4096 (4096//2+1=2049)
    "UVR_MDXNET_1_9703.onnx":         (4096,  1024,  2048,  256,   1.035),
    "UVR_MDXNET_2_9682.onnx":         (4096,  1024,  2048,  256,   1.035),
    "UVR_MDXNET_3_9662.onnx":         (4096,  1024,  2048,  256,   1.035),
    "UVR_MDXNET_KARA.onnx":           (4096,  1024,  2048,  256,   1.035),
    "UVR_MDXNET_KARA_2.onnx":         (4096,  1024,  2048,  256,   1.035),
    # Kuiper lab — probed dim_f=2048 (2048/512 context variants)
    "kuielab_a_vocals.onnx":          (4096,  1024,  2048,  512,   1.0),
    "kuielab_b_vocals.onnx":          (4096,  1024,  2048,  256,   1.035),
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
    MDXNET_MODELS_DIR / "UVR-MDX-NET-Inst_HQ_5.onnx",
    MODELS_DIR / "UVR-MDX-NET-Inst_HQ_5.onnx",
    MDXNET_MODELS_DIR / "UVR-MDX-NET-Inst_HQ_4.onnx",
    MODELS_DIR / "UVR-MDX-NET-Inst_HQ_4.onnx",
    MODELS_DIR / "MDX_Net_Models" / "UVR-MDX-NET-Inst_HQ_5.onnx",
]

DEREVERB_MODEL_PATHS: list[Path] = [
    MDXNET_MODELS_DIR / "Reverb_HQ_By_FoxJoy.onnx",
    MODELS_DIR / "Reverb_HQ_By_FoxJoy.onnx",
]

# ---------------------------------------------------------------------------
# Tiered model selection — derived from benchmark tmp/model_matrix_benchmark/ranked_blended_q80_s20.csv
# Benchmark date: 2026-03-22  |  Scoring: blended = quality_norm*0.80 + speed_norm*0.20
#
# HARD CUTOFFS — a model failing ANY of these is excluded from ALL tiers:
#   speed_norm  < 0.30  → excluded  (slow model)
#   raw score   < 8.5   → excluded  (bad quality)
#   score_num   < 8.5   → excluded  (bad quality)
#   blended     < 0.75  → excluded  (poor overall)
#   relabeled   = true  → excluded  (raw score is 0)
#
# MODELS THAT FAIL CUTOFFS:
#   Voc_FT.onnx      speed_norm=0.293  → fails speed cutoff
#   mdx23c           speed_norm=0.165-0.180 → fails speed cutoff
#   kuielab_a/b      score_num=8.0     → fails quality cutoff
#   KARA_2, Kim_Inst raw=0 relabeled   → excluded
#   demucsv4         score_num=2.0     → fails quality cutoff
#   htdemucs_6s/emb  score_num=1.0     → fails quality cutoff
#   Crowd_HQ_1       score_num=1.0     → fails quality cutoff
#   Reverb_HQ        score_num=1.0     → fails quality cutoff
#
# ELIGIBLE VOCAL MODELS (all 4 cutoffs pass):
#   rank  model                   raw   score  speed_norm  blended
#   1     UVR_MDXNET_3_9662.ort   9.0   9.0    0.8162      0.8832  ← fast
#   2     UVR_MDXNET_KARA.ort     9.0   9.0    0.7841      0.8768  ← fast
#   3     UVR_MDXNET_KARA.onnx    9.0   9.0    0.7541      0.8708  ← fast
#   4     UVR_MDXNET_3_9662.onnx  9.0   9.0    0.7351      0.8670  ← fast
#   5     UVR_MDXNET_2_9682.ort   8.5   8.5    0.8320      0.8464  ← fast
#   6     UVR_MDXNET_1_9703.onnx  8.5   8.5    0.8252      0.8450  ← fast
#   7     UVR_MDXNET_1_9703.ort   8.5   8.5    0.8134      0.8427  ← fast
#   8     UVR_MDXNET_2_9682.onnx  8.5   8.5    0.7620      0.8324  ← fast
#   16    Kim_Vocal_1.ort         9.0   9.0    0.3347      0.7869  ← quality
#   18    Kim_Vocal_1.onnx        9.0   9.0    0.3332      0.7866  ← quality
#   20    Kim_Vocal_2.ort         9.0   9.0    0.3239      0.7848  ← quality
#   22    Kim_Vocal_2.onnx        9.0   9.0    0.3074      0.7815  ← quality
#   23    Voc_FT.ort              9.0   9.0    0.3038      0.7808  ← quality
#
# ELIGIBLE INSTRUMENTAL MODELS (all 4 cutoffs pass):
#   rank  model                      raw   score  speed_norm  blended
#   10    UVR-MDX-NET-Inst_HQ_5.ort  9.0   9.0    0.4063      0.8013  ← fast
#   11    UVR-MDX-NET-Inst_HQ_5.onnx 9.0   9.0    0.4019      0.8004  ← fast
#   15    UVR-MDX-NET-Inst_HQ_4.ort  9.0   9.0    0.3411      0.7882  ← quality
#   19    UVR-MDX-NET-Inst_HQ_4.onnx 9.0   9.0    0.3304      0.7861  ← quality
#
# TIER ASSIGNMENT within eligible pool:
#   fast    = highest blended_score (best combined quality+speed)
#   quality = highest quality_norm, then blended (slower but still eligible)
#   balanced = same as fast
# ---------------------------------------------------------------------------
_VOCAL_TIER_NAMES: dict[str, list[str]] = {
    # fast: top blended scores from eligible pool — ordered by blended desc
    "fast": [
        "UVR_MDXNET_3_9662.onnx",   # blended=0.8832, quality_norm=0.90, speed_norm=0.816
        "UVR_MDXNET_KARA.onnx",     # blended=0.8768, quality_norm=0.90, speed_norm=0.784
        "UVR_MDXNET_2_9682.onnx",   # blended=0.8464, quality_norm=0.85, speed_norm=0.832
        "UVR_MDXNET_1_9703.onnx",   # blended=0.8450, quality_norm=0.85, speed_norm=0.825
    ],
    # balanced: same as fast
    "balanced": [
        "UVR_MDXNET_3_9662.onnx",
        "UVR_MDXNET_KARA.onnx",
        "UVR_MDXNET_2_9682.onnx",
        "UVR_MDXNET_1_9703.onnx",
    ],
    # quality: quality_norm=0.90 models from eligible pool, ordered by blended desc
    # These pass all cutoffs but have lower speed_norm than fast tier
    "quality": [
        "UVR_MDXNET_3_9662.onnx",   # quality_norm=0.90, blended=0.8832 — best of eligible
        "UVR_MDXNET_KARA.onnx",     # quality_norm=0.90, blended=0.8768
        "Kim_Vocal_1.onnx",         # quality_norm=0.90, blended=0.7869
        "Kim_Vocal_2.onnx",         # quality_norm=0.90, blended=0.7848
        "UVR-MDX-NET-Voc_FT.onnx",  # quality_norm=0.90 (ort), blended=0.7808 — note: resolves to .ort
    ],
}

_INST_TIER_NAMES: dict[str, list[str]] = {
    # fast: Inst_HQ_5 — highest blended in eligible inst pool
    "fast": [
        "UVR-MDX-NET-Inst_HQ_5.onnx",  # blended=0.8013, quality_norm=0.90, speed_norm=0.406
    ],
    # balanced: same as fast
    "balanced": [
        "UVR-MDX-NET-Inst_HQ_5.onnx",
    ],
    # quality: all eligible inst models, ordered by blended desc
    "quality": [
        "UVR-MDX-NET-Inst_HQ_5.onnx",  # blended=0.8013, quality_norm=0.90, speed_norm=0.406
        "UVR-MDX-NET-Inst_HQ_4.onnx",  # blended=0.7882, quality_norm=0.90, speed_norm=0.341
    ],
}
}

# ---------------------------------------------------------------------------
# Session cache
# ---------------------------------------------------------------------------
_session_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


def _logical_onnx_name(model_path: Path) -> str:
    """Config keys use ``*.onnx`` names; ``*.ort`` shares the same I/O as the sibling ONNX."""
    if model_path.suffix.lower() == ".ort":
        return model_path.with_suffix(".onnx").name
    return model_path.name


def resolve_mdx_model_path(declared_onnx: Path) -> Path | None:
    """
    Prefer sibling ``.ort`` (ORT format from offline conversion) over ``.onnx`` when both exist.
    Does not apply to ``*.quant.onnx`` variants (no standard ORT sibling name).

    Set env ``BURNTBEATS_DISALLOW_ORT=1`` to prefer ``.onnx`` when both exist (benchmarks).
    """
    import os

    p = declared_onnx.resolve()
    disallow_ort = os.environ.get("BURNTBEATS_DISALLOW_ORT", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    if ".quant." in p.name:
        return p if p.is_file() else None
    if disallow_ort:
        if p.suffix.lower() == ".onnx" and p.is_file():
            return p
        if p.suffix.lower() == ".ort" and p.is_file():
            return p
        return None
    if p.suffix.lower() == ".ort" and p.is_file():
        return p
    ort = p.with_suffix(".ort")
    if ort.is_file():
        return ort
    if p.suffix.lower() == ".onnx" and p.is_file():
        return p
    return None


def _get_config(model_path: Path) -> tuple[int, int, int, int, float] | None:
    """Return (n_fft, hop, dim_f, dim_t, compensate) for a model, or None if unknown."""
    return _MDX_CONFIGS.get(_logical_onnx_name(model_path))


def mdx_model_configured(model_path: Path) -> bool:
    """True if this ONNX model has MDX config (n_fft, hop, dim_f, dim_t) and can be run."""
    return _get_config(model_path) is not None


def _prefer_quantized(path: Path) -> Path:
    """Return .quant.onnx sibling when USE_INT8_ONNX is enabled and file exists."""
    import os

    if os.environ.get("USE_INT8_ONNX", "1").strip().lower() in ("0", "false", "no"):
        return path
    quant = path.parent / f"{path.stem}.quant.onnx"
    return quant if quant.exists() else path


def _candidate_paths_by_names(names: list[str]) -> list[Path]:
    out: list[Path] = []
    for nm in names:
        out.extend(
            [
                MODELS_DIR / nm,
                MDXNET_MODELS_DIR / nm,
                MODELS_DIR / "MDX_Net_Models" / nm,
            ]
        )
    return out


def _normalize_tier(tier: str | None) -> str:
    t = (tier or "").strip().lower()
    return t if t in ("fast", "balanced", "quality") else "balanced"


def get_available_vocal_onnx(tier: str | None = None) -> Path | None:
    """Return first existing vocal ONNX path (tiered order, then fallback list)."""
    t = _normalize_tier(tier)
    for path in _candidate_paths_by_names(_VOCAL_TIER_NAMES[t]) + VOCAL_MODEL_PATHS:
        if path.exists():
            pq = _prefer_quantized(path)
            resolved = resolve_mdx_model_path(pq)
            return resolved if resolved is not None else pq
        ort = path.with_suffix(".ort")
        if ort.is_file():
            return ort
    return None


def get_available_inst_onnx(tier: str | None = None) -> Path | None:
    """Return first existing instrumental ONNX path (tiered order, then fallback list)."""
    t = _normalize_tier(tier)
    for path in _candidate_paths_by_names(_INST_TIER_NAMES[t]) + INST_MODEL_PATHS:
        if path.exists():
            pq = _prefer_quantized(path)
            resolved = resolve_mdx_model_path(pq)
            return resolved if resolved is not None else pq
        ort = path.with_suffix(".ort")
        if ort.is_file():
            return ort
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
            opts.inter_op_num_threads = 1
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
    STFT matching the UVR/audio-separator reference (center=True; complex STFT → view_as_real).
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
        return_complex=True,
    )  # (batch*2, freq, time) complex
    stft_real = torch.view_as_real(stft_out)  # (batch*2, freq, time, 2)

    # permute → (batch*2, 2, freq, time) then reshape → (batch, 4, freq, time)
    perm = stft_real.permute([0, 3, 1, 2])
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
