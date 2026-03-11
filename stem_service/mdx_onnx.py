"""
ONNX Stage 1 vocal separation (AGENT-GUIDE: segment_size 256, overlap 2).
When an ONNX vocal model is present and inference succeeds, use it for Stage 1; else vocal_stage1 falls back to Demucs.
Model config from models/mdxnet_models/model_data.json or MDX_Net_Models/model_data/.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from stem_service.config import MDXNET_MODELS_DIR, MODELS_DIR

logger = logging.getLogger(__name__)

# Vocal ONNX model paths to check (first existing wins). Per AGENT-models-and-implementation.
# Only vocal models (Voc) belong here; do not add instrumental (Inst) models for Stage 1 vocal extraction.
VOCAL_MODEL_PATHS: list[Path] = [
    MDXNET_MODELS_DIR / "Kim_Vocal_2.onnx",
    MDXNET_MODELS_DIR / "UVR-MDX-NET-Voc_FT.onnx",
    MODELS_DIR / "Kim_Vocal_2.onnx",
    MODELS_DIR / "UVR-MDX-NET-Voc_FT.onnx",
]
# Also check MDX_Net_Models for vocal ONNX (some layouts use that dir)
for name in ("Kim_Vocal_2.onnx", "UVR-MDX-NET-Voc_FT.onnx"):
    p = MODELS_DIR / "MDX_Net_Models" / name
    if p not in VOCAL_MODEL_PATHS:
        VOCAL_MODEL_PATHS.append(p)

# model_data.json locations (first existing wins)
MODEL_DATA_PATHS: list[Path] = [
    MDXNET_MODELS_DIR / "model_data.json",
    MODELS_DIR / "mdxnet_models" / "model_data.json",
    MODELS_DIR / "MDX_Net_Models" / "model_data" / "model_data.json",
]


def _load_model_data() -> dict[str, dict] | None:
    """Load model_data.json; return dict keyed by hash or None."""
    for path in MODEL_DATA_PATHS:
        if path.resolve().exists():
            try:
                with open(path, encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                logger.warning("Failed to load %s: %s", path, e)
    return None


def _model_config_for_path(model_path: Path, model_data: dict[str, dict] | None) -> dict | None:
    """Get model_data entry for this ONNX file (by MD5 hash) or first Vocal config."""
    if model_data is None:
        return None
    try:
        raw = model_path.read_bytes()
        key = hashlib.md5(raw).hexdigest()
        if key in model_data:
            entry = model_data[key]
            if "primary_stem" in entry and "mdx_n_fft_scale_set" in entry:
                return entry
    except OSError:
        pass
    # Fallback: first config with primary_stem Vocals
    for entry in model_data.values():
        if isinstance(entry, dict) and entry.get("primary_stem") == "Vocals" and "mdx_n_fft_scale_set" in entry:
            return entry
    return None


def get_available_vocal_onnx() -> Path | None:
    """Return first existing vocal ONNX model path, or None."""
    for path in VOCAL_MODEL_PATHS:
        if path.resolve().exists():
            return path
    return None


def run_vocal_onnx(
    input_path: Path,
    output_path: Path,
    segment_size: int = 256,
    overlap: int = 2,
) -> Path | None:
    """
    Run ONNX vocal separation; write vocals to output_path.
    Per AGENT-GUIDE: segment_size 256, overlap 2 for CPU.
    Returns output_path on success, None if no model or inference fails (caller falls back to Demucs).
    """
    model_path = get_available_vocal_onnx()
    if model_path is None:
        return None
    try:
        import onnxruntime as ort
    except ImportError:
        return None

    model_data = _load_model_data()
    config = _model_config_for_path(model_path, model_data)
    if config is None:
        logger.debug("No model_data config for %s; skipping ONNX", model_path.name)
        return None

    n_fft = int(config["mdx_n_fft_scale_set"])
    _ = int(config["mdx_dim_f_set"])  # config schema; freq dim not used in this inference path
    dim_t = int(config["mdx_dim_t_set"])
    compensate = float(config.get("compensate", 1.0))
    # hop_length typical for MDX: n_fft // 2
    hop_length = n_fft // 2
    n_bins = n_fft // 2 + 1

    try:
        import numpy as np
        import soundfile as sf
        import torch
    except ImportError:
        return None

    # Load audio: stereo, 44100
    try:
        mix, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    except Exception as e:
        logger.warning("mdx_onnx: failed to read %s: %s", input_path, e)
        return None
    if mix.shape[1] != 2:
        mix = np.stack([mix[:, 0], mix[:, 0]], axis=1)
    if sr != 44100:
        import torchaudio
        mix_t = torch.from_numpy(mix.T).unsqueeze(0)
        mix_t = torchaudio.functional.resample(mix_t, sr, 44100)
        mix = mix_t.squeeze(0).numpy().T
        sr = 44100
    # mix: (samples, 2) -> (2, samples)
    mix = mix.T.astype(np.float32)

    session = ort.InferenceSession(
        str(model_path),
        providers=["CPUExecutionProvider"],
    )
    input_name = session.get_inputs()[0].name
    # Expected: (batch, channels, freq, time); try 4-ch (real/imag) then 2-ch (magnitude)
    chunk_samples = hop_length * (dim_t - 1)
    step_samples = max(1, int(chunk_samples * (1 - overlap / 10.0)))
    trim = n_fft // 2
    pad_end = (chunk_samples + trim - (mix.shape[1] % step_samples)) % step_samples
    if pad_end > 0:
        pad_end += step_samples
    mixture = np.concatenate(
        (np.zeros((2, trim), dtype=np.float32), mix, np.zeros((2, pad_end), dtype=np.float32)),
        axis=1,
    )
    total_samples = mixture.shape[1]
    result = np.zeros((2, total_samples), dtype=np.float32)
    divider = np.zeros((2, total_samples), dtype=np.float32)
    window = np.hanning(chunk_samples).astype(np.float32)
    window = np.broadcast_to(window[np.newaxis, :], (2, chunk_samples))

    stft_kwargs = {
        "n_fft": n_fft,
        "hop_length": hop_length,
        "win_length": n_fft,
        "window": torch.hann_window(n_fft),
        "return_complex": True,
    }

    i = 0
    while i < total_samples:
        start = i
        end = min(i + chunk_samples, total_samples)
        chunk_len = end - start
        mix_chunk = mixture[:, start:end]
        if chunk_len < chunk_samples:
            mix_chunk = np.pad(
                mix_chunk,
                ((0, 0), (0, chunk_samples - chunk_len)),
                mode="constant",
                constant_values=0,
            )
        # (2, chunk_samples): STFT per channel -> (1, 2, n_bins, n_frames)
        mix_t = torch.from_numpy(mix_chunk)
        stft_out = torch.stft(mix_t[0], **stft_kwargs).unsqueeze(0)
        stft_right = torch.stft(mix_t[1], **stft_kwargs).unsqueeze(0)
        stft_out = torch.cat([stft_out, stft_right], dim=0).unsqueeze(0)
        # stft_out: (1, 2, n_bins, n_frames) complex
        n_frames = stft_out.shape[-1]
        if n_frames < dim_t:
            pad_frames = dim_t - n_frames
            stft_out = torch.nn.functional.pad(stft_out, (0, pad_frames), mode="constant", value=0)
        stft_slice = stft_out[:, :, :, :dim_t]
        # ONNX: real/imag stacked -> (1, 4, n_bins, dim_t) or magnitude (1, 2, n_bins, dim_t)
        real_imag = torch.view_as_real(stft_slice)
        feed_4ch = real_imag.permute(0, 1, 4, 2, 3).reshape(1, 4, n_bins, dim_t).numpy()
        feed_2ch = torch.abs(stft_slice).float().numpy()

        out = None
        for feed in (feed_4ch, feed_2ch):
            try:
                out = session.run(None, {input_name: feed})[0]
                break
            except Exception:
                continue
        if out is None:
            logger.warning("mdx_onnx: session.run failed for both input formats")
            return None
        # out: (1, 2, n_bins, dim_t) or (1, 4, n_bins, dim_t); convert to complex
        if out.shape[1] == 4:
            out_complex = out[:, :2].astype(np.complex64) + 1j * out[:, 2:4].astype(np.complex64)
        else:
            out_complex = out.astype(np.complex64)
        out_t = torch.from_numpy(out_complex).squeeze(0)
        if not torch.is_complex(out_t):
            n_frames_out = min(out_t.shape[-1], stft_slice.shape[-1])
            phase = torch.angle(stft_slice[:, :, :, :n_frames_out])
            out_t = (out_t[:, :, :, :n_frames_out].float() * torch.exp(1j * phase)).squeeze(0)
        n_frames_out = out_t.shape[-1]
        wav_len = min(chunk_samples, n_frames_out * hop_length)
        waves_list = []
        for ch in range(out_t.shape[0]):
            w = torch.istft(
                out_t[ch : ch + 1],
                n_fft=n_fft,
                hop_length=hop_length,
                win_length=n_fft,
                window=torch.hann_window(n_fft),
                length=wav_len,
            )
            waves_list.append(w)
        waves = torch.cat(waves_list, dim=0).numpy()
        w = window[:, :chunk_len]
        result[:, start:end] += waves[:, :chunk_len] * w
        divider[:, start:end] += w
        i += step_samples

    out_wav = result / np.maximum(divider, 1e-8)
    out_wav = out_wav[:, trim : trim + mix.shape[1]]
    out_wav = (out_wav * compensate).T
    out_wav = np.clip(out_wav, -1.0, 1.0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), out_wav, 44100, subtype="PCM_16")
    return output_path
