"""
SCNet ONNX 4-stem separation (MUSDB18: drums, bass, other, vocals).

Probed I/O (scripts/probe_onnx.py):
  Input:  'spectrogram' (batch, 4, freq, time) — [L_real, L_imag, R_real, R_imag], n_fft=4096
  Output: 'sources'     (batch, 4, 4, freq, time) — 4 stems, each (4, freq, time)

Freq/time are read from the model at runtime (some exports use 2048 freq like Demucs ONNX, others 2049).
When the graph expects freq=2049, we feed Demucs-style 2048 bins plus a zero Nyquist row — full STFT Nyquist
often mismatches internal MatMul weights in those exports.
Used when USE_SCNET=1 and models/scnet.onnx/scnet.onnx exists; faster than Demucs on CPU (NEW-flow).
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import numpy as np

from stem_service.config import (
    SCNET_ONNX,
    TARGET_SAMPLE_RATE,
    get_onnx_providers,
)

logger = logging.getLogger(__name__)

SR = 44100
N_FFT = 4096
HOP = 1024
# Defaults; overridden from model input shape when session is available (some ONNX exports use 2048 freq)
SPEC_FREQ_DEFAULT = 2049  # n_fft//2 + 1
SPEC_TIME_DEFAULT = 336
SEGMENT_SAMPLES_DEFAULT = SPEC_TIME_DEFAULT * HOP  # 344064 ~ 7.8 s

STEM_ORDER_4 = ("drums", "bass", "other", "vocals")
RETURN_ORDER = ("vocals", "drums", "bass", "other")

_session_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()
_selftest_done = False
_runtime_enabled = True
_runtime_disable_reason: str | None = None
_compatible_freq_cached: int | None = None
_compatible_spec_time_cached: int | None = None


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
            opts.inter_op_num_threads = 1
        sess = ort.InferenceSession(
            str(path), sess_options=opts, providers=get_onnx_providers()
        )
        with _cache_lock:
            _session_cache[key] = sess
        logger.info("SCNet ONNX session cached: %s", path.name)
        return sess
    except Exception as e:
        logger.warning("Failed to load SCNet ONNX %s: %s", path.name, e)
        return None


def _parse_dim(dim: Any) -> int | None:
    """Parse a single dimension from ONNX shape (int, np.integer, or None for symbolic)."""
    if dim is None:
        return None
    try:
        v = int(dim)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _get_spec_dims(session: Any) -> tuple[int, int]:
    """Return (spec_freq, spec_time) from model input shape. Handles 2048 or 2049 freq (e.g. Demucs-style export)."""
    inp = session.get_inputs()[0]
    shape = inp.shape
    freq: int | None = None
    time: int | None = None
    if len(shape) >= 4:
        freq = _parse_dim(shape[2])
        time = _parse_dim(shape[3])
    # When model has symbolic dims or we can't parse, use 2048 (matches most SCNet/Demucs-style exports)
    if freq is None:
        freq = 2048
    if time is None:
        time = SPEC_TIME_DEFAULT
    logger.info("SCNet ONNX spec dims: freq=%s time=%s (input shape: %s)", freq, time, list(shape))
    return freq, time


def _build_spec(
    waveform: np.ndarray,
    spec_freq: int,
    spec_time: int,
) -> np.ndarray:
    """Build spectrogram (1, 4, spec_freq, spec_time) from waveform (1, 2, N). Channels: L_real, L_imag, R_real, R_imag."""
    import torch

    segment_samples = spec_time * HOP
    w = torch.from_numpy(waveform[0].astype(np.float32))  # (2, N)
    if w.shape[-1] < segment_samples:
        w = torch.nn.functional.pad(w, (0, segment_samples - w.shape[-1]))
    else:
        w = w[..., :segment_samples]

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
    bins_full = N_FFT // 2 + 1  # 2049
    # 2049 ONNX inputs often match Demucs-style 2048-bin features + zero Nyquist (not raw STFT Nyquist).
    if spec_freq == 2049:
        spec = spec[:, :, :2048, :]
        spec = torch.nn.functional.pad(spec, (0, 0, 0, 1))  # pad freq dim (…, 2049, time)
    elif spec_freq == 2048:
        spec = spec[:, :, :2048, :]
    else:
        spec = spec[:, :, : min(spec_freq, bins_full), :]
        if spec.shape[2] < spec_freq:
            spec = torch.nn.functional.pad(
                spec, (0, 0, 0, spec_freq - spec.shape[2])
            )
    t = spec.shape[3]
    if t < spec_time:
        spec = torch.nn.functional.pad(spec, (0, spec_time - t))
    elif t > spec_time:
        spec = spec[:, :, :, :spec_time]
    return spec.float().numpy()


def _select_compatible_freq(
    session: Any,
    inp_name: str,
    spec_time: int,
    freq_candidates: list[int],
) -> int | None:
    """
    Run a tiny preflight inference with silence to detect which frequency bin count
    is compatible with this SCNet export. Returns compatible freq or None.
    """
    silent_chunk = np.zeros((1, 2, spec_time * HOP), dtype=np.float32)
    for try_freq in freq_candidates:
        try:
            spec_np = _build_spec(silent_chunk, try_freq, spec_time)
            _ = session.run(None, {inp_name: spec_np})
            logger.info("scnet_onnx: preflight succeeded with freq=%s", try_freq)
            return try_freq
        except Exception as error:
            message = str(error)
            if "MatMul" in message and "dimension mismatch" in message:
                logger.warning(
                    "scnet_onnx: preflight MatMul dimension mismatch with freq=%s",
                    try_freq,
                )
                continue
            logger.warning(
                "scnet_onnx: preflight failed with freq=%s: %s",
                try_freq,
                error,
            )
            continue
    return None


def _spec_to_wav(spec_stem: np.ndarray, spec_freq: int) -> np.ndarray:
    """(4, spec_freq, time) -> (2, samples) stereo waveform via iSTFT. Pads to n_fft//2+1 if spec_freq==2048."""
    import torch

    L = torch.from_numpy(spec_stem[0] + 1j * spec_stem[1]).unsqueeze(0)
    R = torch.from_numpy(spec_stem[2] + 1j * spec_stem[3]).unsqueeze(0)
    comp = torch.cat([L, R], dim=0)
    bins_istft = N_FFT // 2 + 1
    if spec_freq < bins_istft:
        comp = torch.nn.functional.pad(comp, (0, 0, 0, bins_istft - spec_freq), mode="constant", value=0.0)
    elif spec_freq > bins_istft:
        comp = comp[:, :bins_istft, :]
    wav = torch.istft(
        comp,
        n_fft=N_FFT,
        hop_length=HOP,
        win_length=N_FFT,
        window=torch.hann_window(N_FFT),
        center=False,
    )
    return wav.numpy()


def _overlap_add(
    chunks: list[tuple[int, int, np.ndarray]],
    total: int,
    segment_samples: int = SEGMENT_SAMPLES_DEFAULT,
) -> np.ndarray:
    """Hann-windowed overlap-add for one stem. chunks: [(start, end, wav (2, len))]."""
    out = np.zeros((2, total), dtype=np.float32)
    cnt = np.zeros((2, total), dtype=np.float32)
    win = np.hanning(segment_samples).astype(np.float32)
    for start, end, wav in chunks:
        length = end - start
        w = win[:length]
        out[:, start:end] += wav[:, :length] * w
        cnt[:, start:end] += w
    return out / np.maximum(cnt, 1e-8)


def _scnet_chunk_hop(seg: int, prefer_speed: bool) -> int:
    """Sliding-window stride; smaller hop = more overlap = less stem bleed at boundaries."""
    return seg // 2 if prefer_speed else seg // 4


def run_scnet_onnx_4stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = True,
) -> list[tuple[str, Path]] | None:
    """
    Run SCNet ONNX 4-stem separation. Returns [(stem_id, path), ...] in RETURN_ORDER or None on failure.
    prefer_speed=False uses a shorter stride (more overlap-add) for cleaner boundaries at higher CPU cost.
    """
    import soundfile as sf

    if not scnet_onnx_runtime_available():
        reason = scnet_onnx_disable_reason()
        if reason:
            logger.warning("scnet_onnx: runtime disabled (%s)", reason)
        return None

    session = _get_session(SCNET_ONNX)
    if session is None:
        logger.warning("scnet_onnx: no session after runtime self-test")
        return None

    inp_name = session.get_inputs()[0].name
    spec_freq, spec_time = _get_spec_dims(session)
    seg = spec_time * HOP

    try:
        mix, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    except Exception as e:
        logger.warning("scnet_onnx: cannot read %s: %s", input_path, e)
        return None

    if mix.shape[1] == 1:
        mix = np.concatenate([mix, mix], axis=1)
    elif mix.shape[1] > 2:
        mix = mix[:, :2]

    if sr != SR:
        import torch
        import torchaudio

        mix_t = torch.from_numpy(mix.T).unsqueeze(0).float()
        mix_t = torchaudio.functional.resample(mix_t, sr, SR)
        mix = mix_t.squeeze(0).numpy().T

    total = mix.shape[0]
    mix_t = np.ascontiguousarray(mix.T).astype(np.float32)
    mix_t = mix_t.reshape(1, 2, -1)

    compatible_freq = _compatible_freq_cached
    if compatible_freq is None:
        # Defensive fallback when self-test cache is unavailable.
        freq_candidates = [spec_freq]
        if spec_freq == 2049:
            freq_candidates.append(2048)
        elif spec_freq == 2048:
            freq_candidates.append(2049)
        compatible_freq = _select_compatible_freq(
            session=session,
            inp_name=inp_name,
            spec_time=spec_time,
            freq_candidates=freq_candidates,
        )
    if compatible_freq is None:
        logger.warning("scnet_onnx: no compatible input freq found; falling back")
        return None

    stem_chunks: list[list[tuple[int, int, np.ndarray]]] = [[] for _ in range(4)]
    used_freq: int | None = None

    for try_freq in [compatible_freq]:
        seg_try = spec_time * HOP
        hop_try = _scnet_chunk_hop(seg_try, prefer_speed)
        stem_chunks = [[] for _ in range(4)]
        pos = 0
        chunk_failed = False
        while pos < total:
            end = min(pos + seg_try, total)
            chunk_len = end - pos
            chunk = mix_t[:, :, pos:end]
            if chunk_len < seg_try:
                chunk = np.pad(
                    chunk,
                    ((0, 0), (0, 0), (0, seg_try - chunk_len)),
                    mode="constant",
                    constant_values=0,
                )

            spec_np = _build_spec(chunk, try_freq, spec_time)
            feed = {inp_name: spec_np}

            try:
                raw = session.run(None, feed)
            except Exception as e:
                err_msg = str(e)
                if "MatMul" in err_msg and "dimension mismatch" in err_msg:
                    logger.warning(
                        "scnet_onnx: MatMul dimension mismatch with preflight-selected freq=%s",
                        try_freq,
                    )
                    chunk_failed = True
                    break
                logger.warning(
                    "scnet_onnx: inference failed (chunk at pos=%d): %s",
                    pos,
                    e,
                )
                return None

            sources = raw[0]
            if sources.ndim != 5 or sources.shape[1] != 4:
                logger.warning(
                    "scnet_onnx: unexpected sources shape %s (expected (1,4,4,%s,time))",
                    sources.shape,
                    try_freq,
                )
                return None

            for i in range(4):
                stem_spec = sources[0, i]
                wav = _spec_to_wav(stem_spec, try_freq)
                stem_chunks[i].append((pos, end, wav[:, :chunk_len].copy()))

            pos += hop_try
            if chunk_len < seg_try:
                break

        if not chunk_failed:
            used_freq = try_freq
            seg = seg_try
            break

    if used_freq is None:
        return None

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    stem_wavs = {
        STEM_ORDER_4[i]: _overlap_add(stem_chunks[i], total, segment_samples=seg)
        for i in range(4)
    }

    result: list[tuple[str, Path]] = []
    for stem_id in RETURN_ORDER:
        wav = stem_wavs[stem_id]
        out_path = output_dir / f"{stem_id}.wav"
        sf.write(str(out_path), wav.T, TARGET_SAMPLE_RATE, subtype="PCM_16")
        result.append((stem_id, out_path))

    return result


def scnet_onnx_available() -> bool:
    """True if SCNet ONNX model exists (caller should also check config.scnet_available() for USE_SCNET)."""
    return SCNET_ONNX.exists()


def scnet_onnx_disable_reason() -> str | None:
    """Reason SCNet runtime was disabled by self-test, if any."""
    return _runtime_disable_reason


def scnet_onnx_runtime_available() -> bool:
    """
    Runtime gate with one-time self-test.
    If preflight fails, SCNet is auto-disabled for this process to avoid repeated failures.
    """
    global _selftest_done, _runtime_enabled, _runtime_disable_reason
    global _compatible_freq_cached, _compatible_spec_time_cached

    with _cache_lock:
        if _selftest_done:
            return _runtime_enabled

    if not SCNET_ONNX.exists():
        with _cache_lock:
            _selftest_done = True
            _runtime_enabled = False
            _runtime_disable_reason = f"missing model at {SCNET_ONNX}"
        return False

    session = _get_session(SCNET_ONNX)
    if session is None:
        with _cache_lock:
            _selftest_done = True
            _runtime_enabled = False
            _runtime_disable_reason = "failed to create ONNX session"
        return False

    try:
        inp_name = session.get_inputs()[0].name
        spec_freq, spec_time = _get_spec_dims(session)
        freq_candidates = [spec_freq]
        if spec_freq == 2049:
            freq_candidates.append(2048)
        elif spec_freq == 2048:
            freq_candidates.append(2049)

        compatible_freq = _select_compatible_freq(
            session=session,
            inp_name=inp_name,
            spec_time=spec_time,
            freq_candidates=freq_candidates,
        )
        with _cache_lock:
            _selftest_done = True
            if compatible_freq is None:
                _runtime_enabled = False
                _runtime_disable_reason = "preflight failed (no compatible freq)"
                _compatible_freq_cached = None
                _compatible_spec_time_cached = None
            else:
                _runtime_enabled = True
                _runtime_disable_reason = None
                _compatible_freq_cached = compatible_freq
                _compatible_spec_time_cached = spec_time
        if compatible_freq is None:
            logger.warning("scnet_onnx: startup self-test failed; disabling SCNet for this process")
        else:
            logger.info(
                "scnet_onnx: startup self-test passed (freq=%s,time=%s)",
                compatible_freq,
                spec_time,
            )
        return compatible_freq is not None
    except Exception as e:
        with _cache_lock:
            _selftest_done = True
            _runtime_enabled = False
            _runtime_disable_reason = f"preflight exception: {e}"
            _compatible_freq_cached = None
            _compatible_spec_time_cached = None
        logger.warning("scnet_onnx: startup self-test exception; disabling SCNet: %s", e)
        return False
