"""Core tempo and timing utilities for MIDI and audio.

This module intentionally keeps the first version simple:

- Constant tempo in BPM (no tempo changes over time).
- Constant time signature (4/4).
- PPQ (ticks-per-quarter-note) and sample-rate configurable.

The API is modeled loosely after Zrythm's TempoMap conversions, but
implemented in pure Python and focused on the needs of this service.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TempoMap:
    """Simple timing model with constant tempo and 4/4 time.

    Parameters
    ----------
    bpm:
        Beats per minute. Must be positive.
    ppq:
        Ticks (pulses) per quarter note. Must be positive.
    sample_rate:
        Audio sample rate in Hz. Must be positive.
    """

    bpm: float = 120.0
    ppq: int = 480
    sample_rate: float = 44_100.0

    def __post_init__(self) -> None:
        if self.bpm <= 0:
            raise ValueError("bpm must be > 0")
        if self.ppq <= 0:
            raise ValueError("ppq must be > 0")
        if self.sample_rate <= 0:
            raise ValueError("sample_rate must be > 0")

    # ------------------------------------------------------------------ #
    # Tick / seconds / samples conversions
    # ------------------------------------------------------------------ #

    def tick_to_seconds(self, ticks: float) -> float:
        """Convert ticks to seconds."""
        beats = ticks / float(self.ppq)
        return (60.0 / self.bpm) * beats

    def seconds_to_tick(self, seconds: float) -> float:
        """Convert seconds to ticks."""
        if seconds <= 0:
            return 0.0
        beats = (seconds * self.bpm) / 60.0
        return beats * float(self.ppq)

    def tick_to_samples(self, ticks: float) -> int:
        """Convert ticks to integer sample index."""
        seconds = self.tick_to_seconds(ticks)
        return int(round(seconds * self.sample_rate))

    def samples_to_tick(self, samples: int | float) -> float:
        """Convert samples to ticks."""
        seconds = float(samples) / self.sample_rate
        return self.seconds_to_tick(seconds)

