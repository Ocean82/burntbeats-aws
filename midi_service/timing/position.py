"""Musical position utilities.

This module defines a minimal musical position representation that can be
used by timing/quantization helpers and, later, by any timeline-aware UI.

For now it assumes a 4/4 time signature; the structure is intentionally
kept simple so we can evolve it alongside the tempo map if we later add
time-signature events.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MusicalPosition:
    """Bar/beat/sixteenth/tick representation.

    All indices are 1-based except ``tick``, which is a 0-based offset
    within the sixteenth note (in ticks).
    """

    bar: int
    beat: int
    sixteenth: int
    tick: int = 0

    def __post_init__(self) -> None:
        if self.bar < 1:
            raise ValueError("bar must be >= 1")
        if self.beat < 1:
            raise ValueError("beat must be >= 1")
        if self.sixteenth < 1:
            raise ValueError("sixteenth must be >= 1")
        if self.tick < 0:
            raise ValueError("tick must be >= 0")

