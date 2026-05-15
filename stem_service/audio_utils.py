"""Shared audio utilities for the stem service."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf


def apply_tpdf_dither(audio: np.ndarray, bit_depth: int = 16) -> np.ndarray:
    """
    Apply TPDF (Triangular Probability Density Function) dithering.

    Adds triangular-distributed noise at 1 LSB amplitude before quantization.
    This decorrelates quantization error from the signal, eliminating
    audible distortion on quiet passages and reverb tails.

    Args:
        audio: float32 array in [-1.0, 1.0] range, shape (samples, channels) or (samples,)
        bit_depth: target bit depth (default 16)

    Returns:
        Dithered float32 array (still in float range, ready for sf.write PCM_16)
    """
    # 1 LSB in float domain for signed N-bit PCM
    lsb = 2.0 / (2**bit_depth)
    # TPDF = sum of two uniform random variables → triangular distribution
    rng = np.random.default_rng()
    dither = (
        rng.random(audio.shape, dtype=np.float32)
        - rng.random(audio.shape, dtype=np.float32)
    ) * lsb
    return audio + dither


def write_wav_float32(path: Path | str, audio: np.ndarray, sr: int) -> None:
    """
    Write audio as 32-bit float WAV (lossless intermediate format).

    Use this for intermediate stems that will be further processed (e.g. phase
    inversion input, Demucs Stage 2 input). Avoids quantization noise that would
    compound through subsequent processing stages.

    Args:
        path: output file path
        audio: float32 array, shape (samples, channels) or (samples,)
        sr: sample rate
    """
    audio = np.clip(audio, -1.0, 1.0).astype(np.float32)
    sf.write(str(path), audio, sr, subtype="FLOAT")


def write_wav_16bit(
    path: Path | str, audio: np.ndarray, sr: int, dither: bool = True
) -> None:
    """
    Write audio to 16-bit PCM WAV with optional TPDF dithering.

    Use this for FINAL output stems delivered to the user. Do NOT use for
    intermediate stems that will be further processed (use write_wav_float32).

    Args:
        path: output file path
        audio: float32 array, shape (samples, channels) or (samples,)
        sr: sample rate
        dither: whether to apply TPDF dithering (default True)
    """
    if dither:
        audio = apply_tpdf_dither(audio, bit_depth=16)
    # Clip after dithering to prevent overflow
    audio = np.clip(audio, -1.0, 1.0)
    sf.write(str(path), audio, sr, subtype="PCM_16")
