"""
SCNet ONNX 4-stem separation (MUSDB18: drums, bass, other, vocals).

Probed I/O (scripts/probe_onnx.py):
  Input:  'spectrogram' (batch, 4, 2049, time) — [L_real, L_imag, R_real, R_imag], n_fft=4096
  Output: 'sources'     (batch, 4, 4, 2049, time) — 4 stems, each (4, 2049, time)

Used when USE_SCNET=1 and models/scnet.onnx/scnet.onnx exists; faster than Demucs on CPU (NEW-flow).
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import numpy as np

from stem_service.config import (
    MODELS_DIR,
    SCNET_ONNX,
    TARGET_SAMPLE_RATE,
    get_onnx_providers,
)

logger = logging.getLogger(__name__)

SR = 44100
N_FFT = 4096
HOP = 1024
SPEC_FREQ = 2049  # n_fft//2 + 1
SPEC_TIME = 336
SEGMENT_SAMPLES = SPEC_TIME * HOP  # 344064 ~ 7.8 s

STEM_ORDER_4 = ("drums", "bass", "other", "vocals")
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
        logger.info("SCNet ONNX session cached: %s", path.name)
        return sess
    except Exception as e:
        logger.warning("Failed to load SCNet ONNX %s: %s", path.name, e)
        return None


def _build_spec(waveform: np.ndarray) -> np.ndarray:
    """Build spectrogram (1, 4, 2049, SPEC_TIME) from waveform (1, 2, N). Channels: L_real, L_imag, R_real, R_imag."""
    import torch

    w = torch.from_numpy(waveform[0].astype(np.float32))  # (2, N)
    pad_to = SEGMENT_SAMPLES
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
    spec = spec[:, :, :SPEC_FREQ, :]
    t = spec.shape[3]
    if t < SPEC_TIME:
        spec = torch.nn.functional.pad(spec, (0, SPEC_TIME - t))
    elif t > SPEC_TIME:
        spec = spec[:, :, :, :SPEC_TIME]
    return spec.float().numpy()


def _spec_to_wav(spec_stem: np.ndarray) -> np.ndarray:
    """(4, 2049, time) -> (2, samples) stereo waveform via iSTFT."""
    import torch

    # spec_stem: (4, 2049, time) = L_real, L_imag, R_real, R_imag
    L = torch.from_numpy(spec_stem[0] + 1j * spec_stem[1]).unsqueeze(0)
    R = torch.from_numpy(spec_stem[2] + 1j * spec_stem[3]).unsqueeze(0)
    comp = torch.cat([L, R], dim=0)
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
) -> np.ndarray:
    """Hann-windowed overlap-add for one stem. chunks: [(start, end, wav (2, len))]."""
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


def run_scnet_onnx_4stem(
    input_path: Path,
    output_dir: Path,
) -> list[tuple[str, Path]] | None:
    """
    Run SCNet ONNX 4-stem separation. Returns [(stem_id, path), ...] in RETURN_ORDER or None on failure.
    """
    import soundfile as sf

    session = _get_session(SCNET_ONNX)
    if session is None:
        logger.warning("scnet_onnx: no session (model load failed or path missing)")
        return None

    inp_name = session.get_inputs()[0].name

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

    seg = SEGMENT_SAMPLES
    hop = seg // 2
    stem_chunks: list[list[tuple[int, int, np.ndarray]]] = [[] for _ in range(4)]

    pos = 0
    while pos < total:
        end = min(pos + seg, total)
        chunk_len = end - pos
        chunk = mix_t[:, :, pos:end]
        if chunk_len < seg:
            chunk = np.pad(
                chunk,
                ((0, 0), (0, 0), (0, seg - chunk_len)),
                mode="constant",
                constant_values=0,
            )

        spec_np = _build_spec(chunk)
        feed = {inp_name: spec_np}

        try:
            raw = session.run(None, feed)
        except Exception as e:
            logger.warning("scnet_onnx: inference failed (chunk at pos=%d): %s", pos, e, exc_info=True)
            return None

        sources = raw[0]
        if sources.ndim != 5 or sources.shape[1] != 4:
            logger.warning("scnet_onnx: unexpected sources shape %s (expected (1,4,4,2049,time))", sources.shape)
            return None

        for i in range(4):
            stem_spec = sources[0, i]
            wav = _spec_to_wav(stem_spec)
            stem_chunks[i].append((pos, end, wav[:, :chunk_len].copy()))

        pos += hop
        if chunk_len < seg:
            break

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    stem_wavs = {STEM_ORDER_4[i]: _overlap_add(stem_chunks[i], total) for i in range(4)}

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
