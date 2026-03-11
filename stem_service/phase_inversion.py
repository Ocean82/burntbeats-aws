"""
Phase inversion: Original - Vocals = Instrumental (when instrumental is not from the same model).
Strict alignment: target length = original length; match sample rate and channel count to avoid
artifacts from padding/latency mismatch. Used only when Stage 1 is ONNX (Demucs gives no_vocals directly).
"""

from __future__ import annotations

from pathlib import Path

import soundfile as sf
import torch
import torchaudio


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
    """
    orig, sr_orig = torchaudio.load(str(original_path))
    vocal, sr_vocal = torchaudio.load(str(vocal_path))

    if sr_orig != sr_vocal:
        vocal = torchaudio.functional.resample(vocal, sr_vocal, sr_orig)

    orig_channels, orig_len = orig.shape[0], orig.shape[1]
    vocal_channels, vocal_len = vocal.shape[0], vocal.shape[1]

    # Match channels: if vocal is mono and orig stereo, broadcast
    if vocal_channels == 1 and orig_channels == 2:
        vocal = vocal.expand(2, -1)
    elif vocal_channels == 2 and orig_channels == 1:
        orig = orig.expand(2, -1)
    elif vocal_channels != orig_channels:
        vocal = vocal[:orig_channels].expand(orig_channels, -1)

    # Align to original length: pad vocal with zeros if shorter, trim if longer (preserves full mix length)
    if vocal.shape[1] < orig_len:
        vocal = torch.nn.functional.pad(vocal, (0, orig_len - vocal.shape[1]), mode="constant", value=0.0)
    else:
        vocal = vocal[..., :orig_len]
    orig = orig[..., :orig_len]

    instrumental = orig - vocal
    instrumental = torch.clamp(instrumental, -1.0, 1.0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), instrumental.T.numpy(), int(sr_orig))
    return output_path
