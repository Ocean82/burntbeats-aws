"""
Spleeter-style quantized ONNX (e.g. models/vocals.int8.onnx).

Reference source (vendored, not imported at runtime): ``models/spleeter-master/spleeter-master``
(Deezer Spleeter — TensorFlow). STFT/mask/iSTFT math is aligned with
``spleeter/model/__init__.py`` (EstimatorSpecBuilder) and ``dataset.py`` DEFAULT_AUDIO_PARAMS.

Metadata (onnx metadata_props): model_type=spleeter, T=512, F=1024, frame_length=4096,
frame_step=1024.

Input tensor name ``x`` with shape (2, num_splits, 512, 1024): stereo channels × time
partitions × magnitude STFT (first 1024 bins). Not compatible with MDX ``run_vocal_onnx``.

STFT/iSTFT use **SciPy** (not ``torch.istft``): some PyTorch builds raise
``RuntimeError: ... window overlap add min: 1`` on CPU iSTFT even for valid spectrograms.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from scipy import signal

from stem_service.config import get_onnx_providers, resolve_models_root_file

logger = logging.getLogger(__name__)

FRAME_LENGTH = 4096
FRAME_STEP = 1024
T_SEG = 512
F_USE = 1024
N_BINS = FRAME_LENGTH // 2 + 1  # 2049
NOVERLAP = FRAME_LENGTH - FRAME_STEP
WINDOW_COMPENSATION = 2.0 / 3.0  # Spleeter EstimatorSpecBuilder

_session_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


def is_spleeter_vocals_int8_onnx(model_path: Path) -> bool:
    """True if this looks like the Spleeter int8 vocal graph (single input ``x``, 4D)."""
    if model_path.name == "vocals.int8.onnx":
        return True
    try:
        import onnxruntime as ort

        sess = ort.InferenceSession(
            str(model_path),
            providers=get_onnx_providers(),
        )
        inputs = sess.get_inputs()
        if len(inputs) != 1 or inputs[0].name != "x":
            return False
        sh = inputs[0].shape
        return len(sh) == 4
    except Exception:
        return False


def _onnx_session(model_path: Path) -> Any | None:
    key = str(model_path.resolve())
    with _cache_lock:
        if key in _session_cache:
            return _session_cache[key]
    try:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess = ort.InferenceSession(
            str(model_path),
            sess_options=opts,
            providers=get_onnx_providers(),
        )
        with _cache_lock:
            _session_cache[key] = sess
        return sess
    except Exception as e:
        logger.warning("spleeter_int8_onnx: failed to load %s: %s", model_path.name, e)
        return None


def _pad_and_partition(x: np.ndarray, segment_len: int) -> np.ndarray:
    """Pad dim 0 and reshape to (splits, segment_len, ...). x: (frames, ...)."""
    n = x.shape[0]
    pad = (segment_len - (n % segment_len)) % segment_len
    if pad:
        x = np.pad(x, ((0, pad),) + ((0, 0),) * (x.ndim - 1), mode="constant")
    splits = x.shape[0] // segment_len
    new_shape = (splits, segment_len) + x.shape[1:]
    return x.reshape(new_shape)


def _extend_mask(mask: np.ndarray, frame_length: int, f_used: int) -> np.ndarray:
    """Spleeter _extend_mask average: (splits, T, F, ch) -> (splits, T, F_full, ch)."""
    n_extra = (frame_length // 2 + 1) - f_used
    if n_extra <= 0:
        return mask
    ext_row = np.mean(mask, axis=2, keepdims=True)
    ext = np.tile(ext_row, (1, 1, n_extra, 1))
    return np.concatenate([mask, ext], axis=2)


def _stft_scipy_stereo(
    wav: np.ndarray, sr: float, win: np.ndarray
) -> tuple[np.ndarray, int]:
    """
    wav: (N, 2) float — already prepended with FRAME_LENGTH zeros at start.
    Returns stft_c (n_frames, N_BINS, 2) complex, n_frames.
    """
    specs: list[np.ndarray] = []
    for c in range(2):
        _, _, zxx = signal.stft(
            wav[:, c],
            fs=sr,
            window=win,
            nperseg=FRAME_LENGTH,
            noverlap=NOVERLAP,
            nfft=FRAME_LENGTH,
            boundary=None,
            padded=False,
        )
        # zxx: (n_freq, n_frames) → (n_frames, n_freq)
        specs.append(zxx.T)
    stft_c = np.stack(specs, axis=-1)
    n_frames = stft_c.shape[0]
    return stft_c, n_frames


def _istft_scipy_channel(
    zxx: np.ndarray,
    sr: float,
    win: np.ndarray,
    expected_len: int,
) -> np.ndarray:
    """
    zxx: (N_BINS, n_frames) complex (SciPy layout).
    """
    _, x = signal.istft(
        zxx,
        fs=sr,
        window=win,
        nperseg=FRAME_LENGTH,
        noverlap=NOVERLAP,
        nfft=FRAME_LENGTH,
        input_onesided=True,
    )
    x = x.astype(np.float32) * WINDOW_COMPENSATION
    if x.shape[0] > expected_len:
        x = x[:expected_len]
    elif x.shape[0] < expected_len:
        x = np.pad(x, (0, expected_len - x.shape[0]), mode="constant")
    return x


def run_spleeter_vocals_int8_2stem(
    input_path: Path,
    output_dir: Path,
    model_path: Path | None = None,
    job_logger: logging.Logger | None = None,
) -> tuple[Path, Path] | None:
    """
    2-stem separation using Spleeter int8 ONNX (vocals magnitude + ratio mask, mix phase).

    Returns (vocals_wav, instrumental_wav) or None on failure.
    """
    _log = job_logger or logger
    path = (
        model_path
        if model_path is not None
        else resolve_models_root_file("vocals.int8.onnx")
    )
    if not path.exists():
        return None

    session = _onnx_session(path)
    if session is None:
        return None

    try:
        mix, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    except Exception as e:
        _log.warning("spleeter_int8_onnx: cannot read %s: %s", input_path, e)
        return None

    if mix.shape[1] == 1:
        mix = np.concatenate([mix, mix], axis=1)
    elif mix.shape[1] > 2:
        mix = mix[:, :2]

    target_sr = 44100
    if sr != target_sr:
        import torch
        import torchaudio

        mix_t = torch.from_numpy(mix.T).unsqueeze(0).float()
        mix_t = torchaudio.functional.resample(mix_t, sr, target_sr)
        mix = mix_t.squeeze(0).numpy().T
        sr = target_sr

    sr_f = float(sr)
    n_samples = mix.shape[0]
    wav = np.concatenate(
        [np.zeros((FRAME_LENGTH, 2), dtype=np.float32), mix.astype(np.float32)], axis=0
    )
    wav_len = wav.shape[0]

    win = signal.windows.hann(FRAME_LENGTH, sym=False)
    stft_c, n_frames = _stft_scipy_stereo(wav, sr_f, win)
    mix_mag = np.abs(stft_c).astype(np.float32)

    mix_mag_part = _pad_and_partition(mix_mag, T_SEG)
    stft_c_part = _pad_and_partition(stft_c, T_SEG)

    mix_mag_in = mix_mag_part[:, :, :F_USE, :]
    x = np.transpose(mix_mag_in, (3, 0, 1, 2))
    x = np.ascontiguousarray(x, dtype=np.float32)

    try:
        y = np.asarray(session.run(None, {"x": x})[0], dtype=np.float32)
    except Exception as e:
        _log.warning("spleeter_int8_onnx: inference failed: %s", e)
        return None

    if y.shape != x.shape:
        _log.warning(
            "spleeter_int8_onnx: unexpected output shape %s (expected %s)",
            y.shape,
            x.shape,
        )
        return None

    y_ch = np.transpose(y, (1, 2, 3, 0))
    mask_s = y_ch / (mix_mag_in + 1e-8)
    mask_s = np.clip(mask_s, 0.0, 1.0)
    mask_f = _extend_mask(mask_s, FRAME_LENGTH, F_USE)

    vocals_c = stft_c_part * mask_f
    flat = vocals_c.reshape(-1, N_BINS, 2)[:n_frames]

    vocals_w = np.zeros((2, wav_len), dtype=np.float32)
    for c in range(2):
        zxx = np.ascontiguousarray(flat[:, :, c].T)
        vocals_w[c] = _istft_scipy_channel(zxx, sr_f, win, wav_len)

    vocals_mono = vocals_w[:, FRAME_LENGTH : FRAME_LENGTH + n_samples]
    if vocals_mono.shape[1] < n_samples:
        vocals_mono = np.pad(
            vocals_mono,
            ((0, 0), (0, n_samples - vocals_mono.shape[1])),
            mode="constant",
        )
    else:
        vocals_mono = vocals_mono[:, :n_samples]

    mix_t = mix.T
    inst = mix_t - vocals_mono
    inst = np.clip(inst, -1.0, 1.0)
    vocals_mono = np.clip(vocals_mono, -1.0, 1.0)

    output_dir.mkdir(parents=True, exist_ok=True)
    v_out = output_dir / "spleeter_vocals.wav"
    i_out = output_dir / "spleeter_instrumental.wav"
    sf.write(str(v_out), vocals_mono.T, sr, subtype="PCM_16")
    sf.write(str(i_out), inst.T, sr, subtype="PCM_16")
    _log.info("spleeter_int8_onnx: wrote %s, %s", v_out.name, i_out.name)
    return v_out, i_out
