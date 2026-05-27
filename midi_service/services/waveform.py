"""Waveform analysis helpers for UI-friendly visualization."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List

import numpy as np
import soundfile as sf


def compute_waveform(path: Path, display_points: int = 512) -> List[float]:
    """Return a normalized mono waveform suitable for drawing.

    The implementation is intentionally lightweight:

    - Loads the entire file via soundfile.
    - Mixes channels to mono by simple averaging.
    - Splits the signal into ``display_points`` windows.
    - Uses the maximum absolute sample in each window.
    - Normalizes the resulting vector to [-1.0, 1.0] (if possible).
    """

    if display_points <= 0:
        raise ValueError("display_points must be positive")

    data, _sr = sf.read(str(path), always_2d=True)
    if data.size == 0:
        return [0.0] * display_points

    mono = data.mean(axis=1)
    length = mono.shape[0]

    if length <= display_points:
        # Pad short signals.
        padded = np.zeros(display_points, dtype=np.float32)
        padded[:length] = mono
        mono = padded
        length = display_points

    window = int(length / display_points)
    if window <= 0:
        window = 1

    peaks: list[float] = []
    for i in range(display_points):
        start = i * window
        end = min(start + window, length)
        segment = mono[start:end]
        if segment.size == 0:
            peaks.append(0.0)
        else:
            peaks.append(float(np.max(np.abs(segment))))

    max_val = max(peaks) if peaks else 0.0
    if max_val > 0:
        peaks = [p / max_val for p in peaks]

    return peaks

