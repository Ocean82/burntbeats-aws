"""
Single-pass 4-stem separation using htdemucs ONNX models (no subprocess, no bag).
- htdemucs_embedded.onnx: Speed 4-stem (fast, CPU-friendly).
- htdemucs_6s.onnx: Quality 4-stem (6 stems from model; we output drums, bass, other, vocals).
Input: waveform (1, 2, 343980) + spectrogram (1, 4, 2048, 336). Output: waveform stems.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

from stem_service.config import MODELS_DIR, TARGET_SAMPLE_RATE, get_onnx_providers

logger = logging.getLogger(__name__)

# Fixed segment from ONNX inspection: 343980 samples @ 44.1k ≈ 7.8s
DEMUCS_ONNX_SEGMENT_SAMPLES = 343980
DEMUCS_ONNX_SR = 44100
DEMUCS_ONNX_N_FFT = 4096
DEMUCS_ONNX_HOP = 1024
# Spectrogram shape (batch, 4=stereo complex-as-channels, freq, time)
DEMUCS_ONNX_SPEC_FREQ = 2048
DEMUCS_ONNX_SPEC_TIME = 336

HTDEMUCS_EMBEDDED_ONNX = MODELS_DIR / "htdemucs_embedded.onnx"
HTDEMUCS_6S_ONNX = MODELS_DIR / "htdemucs_6s.onnx"

_session_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()

# Output tensor name for waveform stems (model-specific)
_EMBEDDED_WAV_OUT = "add_67"
_6S_WAV_OUT = "5012"

# Model output order: drums, bass, other, vocals (indices 0,1,2,3). Return order for API: vocals, drums, bass, other.
STEM_IDS_4 = ("drums", "bass", "other", "vocals")
RETURN_ORDER = ("vocals", "drums", "bass", "other")


def _get_session(path: Path) -> Any | None:
    cache_key = str(path.resolve())
    with _cache_lock:
        if cache_key in _session_cache:
            return _session_cache[cache_key]
    try:
        import os
        import onnxruntime as ort
    except ImportError:
        return None
    try:
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        n = os.environ.get("ONNXRUNTIME_NUM_THREADS", "")
        if n.isdigit() and int(n) >= 0:
            opts.intra_op_num_threads = int(n)
        sess = ort.InferenceSession(
            str(path), sess_options=opts, providers=get_onnx_providers()
        )
        with _cache_lock:
            _session_cache[cache_key] = sess
        logger.info("Demucs ONNX session cached: %s", path.name)
        return sess
    except Exception as e:
        logger.warning("Failed to load Demucs ONNX %s: %s", path, e)
        return None


def _make_spec(waveform: Any) -> Any:
    """Build (1, 4, 2048, 336) complex-as-channels spectrogram from (1, 2, 343980) waveform."""
    import numpy as np
    import torch

    # waveform: (1, 2, 343980). Model expects spec (1, 4, 2048, 336). Use center=False so frame count is deterministic.
    pad_to = DEMUCS_ONNX_SPEC_TIME * DEMUCS_ONNX_HOP  # 344064
    if waveform.shape[-1] < pad_to:
        waveform = torch.nn.functional.pad(
            waveform, (0, pad_to - waveform.shape[-1]), mode="constant", value=0
        )
    else:
        waveform = waveform[..., :pad_to]

    stft_kw = {
        "n_fft": DEMUCS_ONNX_N_FFT,
        "hop_length": DEMUCS_ONNX_HOP,
        "win_length": DEMUCS_ONNX_N_FFT,
        "window": torch.hann_window(DEMUCS_ONNX_N_FFT, device=waveform.device),
        "return_complex": True,
        "center": False,
    }
    spec_l = torch.stft(waveform[0, 0], **stft_kw)
    spec_r = torch.stft(waveform[0, 1], **stft_kw)
    real_imag = torch.stack([spec_l.real, spec_l.imag, spec_r.real, spec_r.imag], dim=0)
    real_imag = real_imag.unsqueeze(0)
    # Slice to (1, 4, 2048, T); then pad or slice time to exactly 336
    real_imag = real_imag[:, :, : DEMUCS_ONNX_SPEC_FREQ, :]
    t = real_imag.shape[3]
    if t < DEMUCS_ONNX_SPEC_TIME:
        real_imag = torch.nn.functional.pad(
            real_imag, (0, DEMUCS_ONNX_SPEC_TIME - t), mode="constant", value=0
        )
    elif t > DEMUCS_ONNX_SPEC_TIME:
        real_imag = real_imag[:, :, :, : DEMUCS_ONNX_SPEC_TIME]
    spec_np = real_imag.float().numpy()
    if spec_np.shape == (1, 4, DEMUCS_ONNX_SPEC_FREQ, DEMUCS_ONNX_SPEC_TIME):
        return spec_np
    out = np.zeros((1, 4, DEMUCS_ONNX_SPEC_FREQ, DEMUCS_ONNX_SPEC_TIME), dtype=np.float32)
    out[:, :, :, : spec_np.shape[3]] = spec_np
    return out


def _run_one_chunk(
    session: Any,
    waveform_chunk: Any,
    spec_chunk: Any,
    input_name: str,
    spec_input_name: str,
    wav_output_name: str,
    num_stems: int,
) -> Any:
    """Run ONNX for one chunk. waveform_chunk (1,2,N), spec_chunk (1,4,2048,336). Returns (num_stems, 2, N)."""
    feed = {input_name: waveform_chunk, spec_input_name: spec_chunk}
    outputs = session.run(None, feed)
    wav_out = None
    for i, out in enumerate(session.get_outputs()):
        arr = outputs[i]
        if out.name == wav_output_name:
            wav_out = arr
            break
        if arr.ndim == 4 and arr.shape[1] in (4, 6) and arr.shape[2] == 2:
            wav_out = arr
            break
    if wav_out is None:
        for arr in outputs:
            if arr.ndim == 4 and arr.shape[2] == 2:
                wav_out = arr
                break
    if wav_out is None:
        wav_out = outputs[-1]
    return wav_out[0]


def run_demucs_onnx_4stem(
    input_path: Path,
    output_dir: Path,
    use_6s: bool,
) -> list[tuple[str, Path]] | None:
    """
    Single-pass 4-stem separation using htdemucs_embedded (use_6s=False) or htdemucs_6s (use_6s=True).
    Writes vocals, drums, bass, other to output_dir and returns [(stem_id, path), ...].
    Returns None if model missing or inference fails.
    """
    import numpy as np
    import soundfile as sf
    import torch

    if use_6s:
        model_path = HTDEMUCS_6S_ONNX
        wav_output_name = _6S_WAV_OUT
        num_stems_in_model = 6
    else:
        model_path = HTDEMUCS_EMBEDDED_ONNX
        wav_output_name = _EMBEDDED_WAV_OUT
        num_stems_in_model = 4

    if not model_path.resolve().exists():
        logger.debug("Demucs ONNX not found: %s", model_path)
        return None

    session = _get_session(model_path)
    if session is None:
        return None

    inputs = session.get_inputs()
    input_name = inputs[0].name
    spec_input_name = inputs[1].name

    try:
        mix, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    except Exception as e:
        logger.warning("demucs_onnx: failed to read %s: %s", input_path, e)
        return None

    if mix.shape[1] != 2:
        mix = np.stack([mix[:, 0], mix[:, 0]], axis=1)
    if sr != DEMUCS_ONNX_SR:
        try:
            import torchaudio
            mix_t = torch.from_numpy(mix.T).unsqueeze(0)
            mix_t = torchaudio.functional.resample(mix_t, sr, DEMUCS_ONNX_SR)
            mix = mix_t.squeeze(0).numpy().T
            sr = DEMUCS_ONNX_SR
        except ImportError:
            logger.warning("demucs_onnx: resample requires torchaudio")
            return None

    # (samples, 2) -> (1, 2, samples)
    mix_t = torch.from_numpy(np.expand_dims(mix.T.astype(np.float32), axis=0))
    total_samples = mix_t.shape[2]
    segment = DEMUCS_ONNX_SEGMENT_SAMPLES
    hop = segment // 2  # 50% overlap for overlap-add

    stem_waves: list[list[tuple[int, int, np.ndarray]]] = [
        [] for _ in range(4)
    ]  # per stem: [(start, end, wav), ...]

    start = 0
    while start < total_samples:
        end = min(start + segment, total_samples)
        chunk_len = end - start
        pad_right = segment - chunk_len if chunk_len < segment else 0
        chunk = mix_t[:, :, start:end]
        if pad_right > 0:
            chunk = torch.nn.functional.pad(
                chunk, (0, pad_right), mode="constant", value=0
            )
        chunk_np = chunk.numpy()
        spec_np = _make_spec(chunk)

        out_wav = _run_one_chunk(
            session,
            chunk_np,
            spec_np,
            input_name,
            spec_input_name,
            wav_output_name,
            num_stems_in_model,
        )
        # out_wav: (num_stems, 2, segment)
        if num_stems_in_model == 6:
            # Use first 4 stems; fold 4,5 into "other" (index 2)
            out_4 = np.stack([
                out_wav[0],
                out_wav[1],
                out_wav[2] + out_wav[4] + out_wav[5],
                out_wav[3],
            ], axis=0)
        else:
            out_4 = out_wav

        for i in range(4):
            w = out_4[i][:, :chunk_len]
            stem_waves[i].append((start, start + chunk_len, w))

        start += hop
        if chunk_len < segment:
            break

    # Overlap-add (simple: average where overlapping)
    out_stems: list[np.ndarray] = []
    for i in range(4):
        combined = np.zeros((2, total_samples), dtype=np.float32)
        count = np.zeros((2, total_samples), dtype=np.float32)
        for s, e, w in stem_waves[i]:
            combined[:, s:e] += w
            count[:, s:e] += 1
        count = np.maximum(count, 1e-8)
        out_stems.append(combined / count)

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    # Write files; then return in API order (vocals, drums, bass, other)
    stem_to_wav = dict(zip(STEM_IDS_4, out_stems))
    result: list[tuple[str, Path]] = []
    for stem_id in RETURN_ORDER:
        wav = stem_to_wav[stem_id]
        out_path = output_dir / f"{stem_id}.wav"
        sf.write(
            str(out_path),
            wav.T,
            TARGET_SAMPLE_RATE,
            subtype="PCM_16",
        )
        result.append((stem_id, out_path))

    return result


def demucs_onnx_embedded_available() -> bool:
    return HTDEMUCS_EMBEDDED_ONNX.resolve().exists()


def demucs_onnx_6s_available() -> bool:
    return HTDEMUCS_6S_ONNX.resolve().exists()
