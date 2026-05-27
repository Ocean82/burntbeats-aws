"""Quantization policies for aligning events to musical boundaries.

These helpers are intentionally simple and operate purely in the
time-domain (seconds), using ``TempoMap`` as an adapter between musical
positions and real time.
"""

from __future__ import annotations

from typing import Literal

from .tempo_map import TempoMap

QuantizePolicy = Literal["immediate", "next_beat", "next_bar"]


def next_start_time(
    current_time: float,
    buffer_end_time: float,
    tempo_map: TempoMap,
    policy: QuantizePolicy,
) -> float | None:
    """Return the time in seconds at which playback should start.

    Parameters
    ----------
    current_time:
        Start of the current processing window (seconds).
    buffer_end_time:
        End of the current processing window (seconds).
    tempo_map:
        Tempo map used for conversions between time and ticks.
    policy:
        Quantization behavior: ``\"immediate\"``, ``\"next_beat\"`` or
        ``\"next_bar\"``.

    Returns
    -------
    float | None
        Start time in seconds if playback should start within this
        window, otherwise ``None``.
    """

    if buffer_end_time <= current_time:
        return None

    if policy == "immediate":
        return current_time

    # Convert window to ticks so we can reason in musical space.
    start_tick = tempo_map.seconds_to_tick(current_time)
    end_tick = tempo_map.seconds_to_tick(buffer_end_time)

    ppq = float(tempo_map.ppq)
    ticks_per_bar = 4.0 * ppq  # 4/4 for now
    ticks_per_beat = ppq

    if policy == "next_bar":
        # Next integer bar boundary after current_time.
        bar_index = int(start_tick // ticks_per_bar)
        next_bar_start_tick = (bar_index + 1) * ticks_per_bar
        if next_bar_start_tick <= end_tick:
            return tempo_map.tick_to_seconds(next_bar_start_tick)
        return None

    if policy == "next_beat":
        # Next beat boundary within or after the current bar.
        beat_index = int(start_tick // ticks_per_beat)
        next_beat_start_tick = (beat_index + 1) * ticks_per_beat
        if next_beat_start_tick <= end_tick:
            return tempo_map.tick_to_seconds(next_beat_start_tick)
        return None

    raise ValueError(f"Unsupported quantize policy: {policy}")

