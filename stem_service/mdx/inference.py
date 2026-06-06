"""
MDX-Net ONNX inference pipelines.

Core chunked inference following the UVR5 / audio-separator reference exactly.
Public API: run_vocal_onnx, run_inst_onnx.

The model takes a spectrogram chunk (batch, 4, dim_f, dim_t) and outputs a
separated spectrogram of the same shape. The output is fed directly to iSTFT —
there is no explicit mask multiplication step; the network learns to output the
separated spectrogram directly.

See docs/MODEL-PARAMS.md for parameter authority.
See docs/research/ONNX-RUNTIME.md for locked production policies.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    pass

from stem_service.mdx.model_registry import (
    _get_config,
    _logical_onnx_name,
    get_available_inst_onnx,
    get_available_vocal_onnx,
    vocal_onnx_allowed_for_service,
)
from stem_service.mdx.session import _onnx_session
from stem_service.mdx.stft import _istft, _stft
from stem_service.audio_utils import write_wav_16bit, write_wav_float32

logger = logging.getLogger(__name__)


def _run_mdx_onnx(
    input_path: Path,
    output_path: Path,
    model_path: Path,
    overlap: float = 0.75,
    job_logger: "logging.Logger | None" = None,
    instrumental_output_path: Path | None = None,
    progress_callback: "Callable[[int], None] | None" = None,
    progress_range: "tuple[int, int] | None" = None,
    compensate_override: float | None = None,
) -> Path | None:
    """
    Core MDX-Net ONNX inference following the UVR5 / audio-separator reference exactly.

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
    if compensate_override is not None:
        compensate = compensate_override

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

    sr_original = sr  # preserve original sample rate for output resample-back
    if sr != 44100:
        import torchaudio

        mix_t = torch.from_numpy(mix.T).unsqueeze(0).float()
        # Use higher-quality resampling (wider filter) to reduce aliasing artifacts
        # when converting from 48kHz or other rates to the model's native 44.1kHz.
        mix_t = torchaudio.functional.resample(
            mix_t, sr, 44100, lowpass_filter_width=64
        )
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
        duration_s,
        n_fft,
        hop,
        chunk_size,
        step,
        n_chunks,
        overlap * 100,
    )

    result = np.zeros((1, 2, total), dtype=np.float32)
    divider = np.zeros((1, 2, total), dtype=np.float32)

    # ── Progress range helpers ────────────────────────────────────────────────
    _prog_start, _prog_end = progress_range if progress_range else (0, 100)
    _last_reported_pct: int = -1

    def _emit_chunk_progress(chunk_idx: int, n_chunks: int) -> None:
        nonlocal _last_reported_pct
        if progress_callback is None or n_chunks == 0:
            return
        frac = chunk_idx / n_chunks
        pct = int(_prog_start + frac * (_prog_end - _prog_start))
        if pct != _last_reported_pct:
            _last_reported_pct = pct
            try:
                progress_callback(pct)
            except Exception:
                pass  # never let a progress callback crash inference

    # ── Process chunks ────────────────────────────────────────────────────────
    hann_window_cache: dict[int, np.ndarray] = {}
    chunk_idx = 0
    for i in range(0, total, step):
        chunk_idx += 1
        if chunk_idx % 10 == 0 or chunk_idx == 1:
            elapsed = time.monotonic() - t_start
            _log.info(
                "mdx_onnx: chunk %d/%d  elapsed=%.1fs",
                chunk_idx,
                n_chunks,
                elapsed,
            )
        _emit_chunk_progress(chunk_idx, n_chunks)

        start = i
        end = min(i + chunk_size, total)
        chunk_size_actual = end - start

        # Hann window for overlap-add
        window = hann_window_cache.get(chunk_size_actual)
        if window is None:
            window = np.hanning(chunk_size_actual).astype(np.float32)
            hann_window_cache[chunk_size_actual] = window
        window = np.tile(window[None, None, :], (1, 2, 1))

        # Extract chunk, zero-pad if short
        mix_part = mixture[:, start:end]
        if end != i + chunk_size:
            pad_size = (i + chunk_size) - end
            mix_part = np.concatenate(
                [mix_part, np.zeros((2, pad_size), dtype=np.float32)], axis=-1
            )

        # (2, chunk_size) → (1, 2, chunk_size) tensor
        mix_tensor = torch.from_numpy(mix_part[np.newaxis]).to(dtype=torch.float32)

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
        wav_out = _istft(torch.from_numpy(spec_pred), n_fft, hop).numpy()

        # Overlap-add with Hann window
        result[..., start:end] += wav_out[..., : end - start] * window
        divider[..., start:end] += window

    elapsed_total = time.monotonic() - t_start
    _log.info(
        "mdx_onnx: finished %d chunks in %.1fs (%.2fs/chunk)",
        chunk_idx,
        elapsed_total,
        elapsed_total / max(chunk_idx, 1),
    )

    # ── Reconstruct ───────────────────────────────────────────────────────────
    tar_waves = result / np.maximum(divider, 1e-8)
    # Trim padding and restore original length (UVR: [trim:-trim] then [:n_samples])
    tar_waves = tar_waves[:, :, trim:-trim]
    source = tar_waves[0, :, :n_samples]  # (2, n_samples)

    vocal_matrix = source * compensate  # (2, n_samples), matches written vocal
    out_wav = vocal_matrix.T  # (n_samples, 2)
    out_wav = np.clip(out_wav, -1.0, 1.0)

    # Resample back to original rate if input was not 44.1 kHz
    if sr_original != 44100:
        import torchaudio

        out_tensor = torch.from_numpy(out_wav.T).unsqueeze(0).float()
        out_tensor = torchaudio.functional.resample(
            out_tensor, 44100, sr_original, lowpass_filter_width=64
        )
        out_wav = out_tensor.squeeze(0).numpy().T

    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_wav_float32(output_path, out_wav, sr_original)
    _log.info("mdx_onnx: wrote %s (%s)", output_path.name, model_path.name)

    # MDX23C vocal checkpoint: complementary instrumental = mix minus vocal (same pass, no second ONNX).
    if (
        instrumental_output_path is not None
        and _logical_onnx_name(model_path) == "mdx23c_vocal.onnx"
    ):
        try:
            inst = mix_np[:, :n_samples].astype(np.float32) - vocal_matrix.astype(np.float32)
            inst_wav = np.clip(inst.T, -1.0, 1.0)
            # Resample back to original rate if input was not 44.1 kHz
            if sr_original != 44100:
                import torchaudio

                inst_tensor = torch.from_numpy(inst_wav.T).unsqueeze(0).float()
                inst_tensor = torchaudio.functional.resample(
                    inst_tensor, 44100, sr_original, lowpass_filter_width=64
                )
                inst_wav = inst_tensor.squeeze(0).numpy().T
            instrumental_output_path = Path(instrumental_output_path)
            instrumental_output_path.parent.mkdir(parents=True, exist_ok=True)
            write_wav_float32(instrumental_output_path, inst_wav, sr_original)
            _log.info(
                "mdx_onnx: wrote %s (mix minus vocal, %s)",
                instrumental_output_path.name,
                model_path.name,
            )
        except Exception as e:
            _log.warning("mdx_onnx: instrumental companion write failed: %s", e)
            try:
                output_path.unlink(missing_ok=True)
            except OSError:
                pass
            return None

    return output_path


def run_vocal_onnx(
    input_path: Path,
    output_path: Path,
    segment_size: int = 256,  # kept for API compat; dim_t is from model config
    overlap: float = 0.75,
    job_logger: "logging.Logger | None" = None,
    model_path_override: Path | None = None,
    instrumental_output_path: Path | None = None,
    progress_callback: "Callable[[int], None] | None" = None,
    progress_range: "tuple[int, int] | None" = None,
) -> Path | None:
    """
    Extract vocals using the best available vocal ONNX model (or model_path_override when set).
    overlap: 0.5 for speed, 0.75 for quality (smoother chunk boundaries).
    For ``mdx23c_vocal.onnx`` / ``.ort``, if ``instrumental_output_path`` is set, also writes
    instrumental = input mix minus vocal (same inference pass; MDX23C quality path).
    progress_callback: optional callable(pct) called as chunks are processed.
    progress_range: (start, end) to map chunk progress into a sub-range of the parent job.
    Returns output_path on success, None if no model or inference fails.
    """
    model_path = (
        model_path_override
        if model_path_override is not None
        else get_available_vocal_onnx()
    )
    if model_path is None or not model_path.exists():
        logger.debug("No vocal ONNX model found")
        return None
    if not vocal_onnx_allowed_for_service(model_path):
        logger.warning(
            "Vocal ONNX %s is not used by stem service (below minimum benchmark tier)",
            model_path.name,
        )
        return None
    return _run_mdx_onnx(
        input_path,
        output_path,
        model_path,
        overlap=overlap,
        job_logger=job_logger,
        instrumental_output_path=instrumental_output_path,
        progress_callback=progress_callback,
        progress_range=progress_range,
    )


def run_inst_onnx(
    input_path: Path,
    output_path: Path,
    overlap: float = 0.75,
    job_logger: "logging.Logger | None" = None,
    model_path_override: Path | None = None,
    progress_callback: "Callable[[int], None] | None" = None,
    progress_range: "tuple[int, int] | None" = None,
    compensate_override: float | None = None,
) -> Path | None:
    """
    Extract instrumental using the best available instrumental ONNX model.
    overlap: 0.5 for speed, 0.75 for quality (smoother chunk boundaries).
    Returns output_path on success, None if no model or inference fails.
    """
    model_path = (
        model_path_override
        if model_path_override is not None
        else get_available_inst_onnx()
    )
    if model_path is None or not model_path.exists():
        logger.debug("No instrumental ONNX model found")
        return None
    return _run_mdx_onnx(
        input_path,
        output_path,
        model_path,
        overlap=overlap,
        job_logger=job_logger,
        progress_callback=progress_callback,
        progress_range=progress_range,
        compensate_override=compensate_override,
    )
