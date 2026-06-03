"""
Phase inversion: Original - Vocals = Instrumental (when instrumental is not from the same model).
Strict alignment: target length = original length; match sample rate and channel count to avoid
artifacts from padding/latency mismatch. Used only when Stage 1 is ONNX (Demucs gives no_vocals directly).
"""

from __future__ import annotations

from pathlib import Path

import torch
import torchaudio


def _load_audio_tensor(path: Path) -> tuple[torch.Tensor, int]:
    """Load (channels_first, float32) and sample rate. Prefer soundfile for WAV/FLAC when installed."""
    suf = path.suffix.lower()
    if suf in (".wav", ".flac", ".ogg", ".aif", ".aiff"):
        try:
            import soundfile as sf

            data, sr = sf.read(str(path), always_2d=True, dtype="float32")
            return torch.from_numpy(data.T), int(sr)
        except ImportError:
            pass
    wav, sr = torchaudio.load(str(path))
    return wav, int(sr)


def _write_wav(path: Path, ch_last: torch.Tensor, sr: int) -> None:
    """Write stereo/mono float32 WAV (intermediate format — no quantization loss)."""
    arr = ch_last.detach().cpu().numpy()
    try:
        import soundfile as sf

        sf.write(str(path), arr, int(sr), subtype="FLOAT")
    except ImportError:
        torchaudio.save(str(path), torch.from_numpy(arr.T).float(), int(sr))


def _soft_limit(x: torch.Tensor, threshold: float = 0.98, ceiling: float = 1.0) -> torch.Tensor:
    """
    Tanh-based soft limiter — preserves dynamics while preventing hard clipping.

    Values within [-threshold, threshold] pass through unchanged.
    Values beyond threshold are smoothly compressed toward ceiling using tanh.
    This avoids the harsh distortion of hard clipping while keeping output in [-1, 1].

    The threshold is set high (0.98) to preserve transient punch and dynamic range
    in instrumental stems produced by phase inversion. Only the top 2% of headroom
    is compressed, which is sufficient to catch rare inter-sample peaks without
    audibly squashing drums or bass.

    Args:
        x: input tensor
        threshold: level below which signal passes unchanged (default 0.98)
        ceiling: maximum output level (default 1.0)
    """
    knee_range = ceiling - threshold
    if knee_range <= 0:
        return torch.clamp(x, -ceiling, ceiling)

    result = x.clone()

    # Above threshold: map [threshold, inf) -> [threshold, ceiling) via tanh
    mask_pos = x > threshold
    if mask_pos.any():
        excess = (x[mask_pos] - threshold) / knee_range
        result[mask_pos] = threshold + knee_range * torch.tanh(excess)

    # Below -threshold: map (-inf, -threshold] -> (-ceiling, -threshold] via tanh
    mask_neg = x < -threshold
    if mask_neg.any():
        excess = (-x[mask_neg] - threshold) / knee_range
        result[mask_neg] = -(threshold + knee_range * torch.tanh(excess))

    return result


def create_perfect_instrumental(
    original_path: Path,
    vocal_path: Path,
    output_path: Path,
) -> Path:
    """
    Instrumental = Original - Vocals, with strict alignment to avoid phase artifacts.
    - Sample rate: resample vocal to original SR if needed.
    - Length: use original length; pad vocal with zeros if shorter, trim if longer (so no tail loss).
    - Channels: if vocal is mono and original stereo, broadcast vocal to stereo; same shape [channels, samples].
    Clips output to [-1, 1] and writes output_path.

    Raises:
        FileNotFoundError: If original_path or vocal_path does not exist or is not a file.
        ValueError: If loaded original audio has no samples.
        RuntimeError: If loading or writing audio fails (with context).
    """
    original_path = Path(original_path)
    vocal_path = Path(vocal_path)
    output_path = Path(output_path)

    if not original_path.is_file():
        raise FileNotFoundError(f"Original audio not found or not a file: {original_path}")
    if not vocal_path.is_file():
        raise FileNotFoundError(f"Vocal audio not found or not a file: {vocal_path}")

    try:
        orig, sr_orig = _load_audio_tensor(original_path)
        vocal, sr_vocal = _load_audio_tensor(vocal_path)
    except Exception as e:
        raise RuntimeError(f"Failed to load audio for phase inversion: {e}") from e

    if sr_orig != sr_vocal:
        vocal = torchaudio.functional.resample(vocal, sr_vocal, sr_orig)

    orig_channels, orig_len = orig.shape[0], orig.shape[1]
    vocal_channels = vocal.shape[0]

    if orig_len == 0:
        raise ValueError(f"Original audio has no samples: {original_path}")

    # Match channels: if vocal is mono and orig stereo, broadcast
    if vocal_channels == 1 and orig_channels == 2:
        vocal = vocal.expand(2, -1)
    elif vocal_channels == 2 and orig_channels == 1:
        orig = orig.expand(2, -1)
    elif vocal_channels != orig_channels:
        vocal = vocal[:orig_channels].expand(orig_channels, -1)

    # Align to original length: pad vocal with zeros if shorter, trim if longer (preserves full mix length)
    if vocal.shape[1] < orig_len:
        vocal = torch.nn.functional.pad(
            vocal, (0, orig_len - vocal.shape[1]), mode="constant", value=0.0
        )
    else:
        vocal = vocal[..., :orig_len]
    orig = orig[..., :orig_len]

    instrumental = orig - vocal
    instrumental = _soft_limit(instrumental)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        _write_wav(output_path, instrumental.T, int(sr_orig))
    except Exception as e:
        raise RuntimeError(f"Failed to write instrumental WAV to {output_path}: {e}") from e
    return output_path


def create_residual_stem(
    original_path: Path,
    subtract_paths: list[Path],
    output_path: Path,
) -> Path:
    """
    Residual stem = original mix minus one or more aligned stem WAVs.
    Used for *other* when MDX drums/bass (and optionally vocals) are extracted separately.
    """
    original_path = Path(original_path)
    output_path = Path(output_path)

    if not original_path.is_file():
        raise FileNotFoundError(f"Original audio not found: {original_path}")

    try:
        residual, sr = _load_audio_tensor(original_path)
    except Exception as e:
        raise RuntimeError(f"Failed to load original for residual stem: {e}") from e

    if residual.shape[1] == 0:
        raise ValueError(f"Original audio has no samples: {original_path}")

    for sub_path in subtract_paths:
        sub_path = Path(sub_path)
        if not sub_path.is_file():
            raise FileNotFoundError(f"Subtract stem not found: {sub_path}")
        try:
            sub, sr_sub = _load_audio_tensor(sub_path)
        except Exception as e:
            raise RuntimeError(f"Failed to load subtract stem {sub_path}: {e}") from e

        if sr_sub != sr:
            sub = torchaudio.functional.resample(sub, sr_sub, sr)

        sub_channels = sub.shape[0]
        res_channels = residual.shape[0]
        if sub_channels == 1 and res_channels == 2:
            sub = sub.expand(2, -1)
        elif sub_channels == 2 and res_channels == 1:
            residual = residual.expand(2, -1)
            res_channels = 2
        elif sub_channels != res_channels:
            sub = sub[:res_channels].expand(res_channels, -1)

        res_len = residual.shape[1]
        if sub.shape[1] < res_len:
            sub = torch.nn.functional.pad(
                sub, (0, res_len - sub.shape[1]), mode="constant", value=0.0
            )
        else:
            sub = sub[..., :res_len]
        residual = residual[..., :res_len] - sub

    residual = _soft_limit(residual)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        _write_wav(output_path, residual.T, int(sr))
    except Exception as e:
        raise RuntimeError(f"Failed to write residual stem to {output_path}: {e}") from e
    return output_path
