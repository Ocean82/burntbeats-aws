"""Basic spectrum analysis for visualization."""

from __future__ import annotations

from pathlib import Path
from typing import List

import numpy as np
import soundfile as sf


def compute_spectrum(path: Path, fft_size: int = 2048) -> List[float]:
    """Compute a simple magnitude spectrum from an audio file.

    This is not intended to be a scientific analysis tool; it just
    provides enough information for a UI spectrum display.
    """

    if fft_size <= 0:
        raise ValueError("fft_size must be positive")

    data, _sr = sf.read(str(path), always_2d=True)
    if data.size == 0:
        return [0.0] * (fft_size // 2)

    mono = data.mean(axis=1)
    if mono.shape[0] < fft_size:
        # Zero-pad if the file is shorter than the FFT window.
        padded = np.zeros(fft_size, dtype=np.float32)
        padded[: mono.shape[0]] = mono
        mono = padded

    window = np.hanning(fft_size)
    segment = mono[:fft_size] * window
    spectrum = np.fft.rfft(segment)
    mags = np.abs(spectrum)

    # Normalize for UI usage.
    max_val = float(mags.max()) if mags.size else 0.0
    if max_val > 0:
        mags = mags / max_val

    return [float(m) for m in mags]

