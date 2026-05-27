from __future__ import annotations

from midi_service.timing.quantize import next_start_time
from midi_service.timing.tempo_map import TempoMap


def test_immediate_policy_returns_current_time() -> None:
    tm = TempoMap()
    t = next_start_time(1.0, 1.5, tm, "immediate")
    assert t == 1.0


def test_next_bar_when_window_crosses_bar_boundary() -> None:
    tm = TempoMap(bpm=120.0, ppq=480, sample_rate=44100.0)
    # One bar at 120 BPM and 4/4 is 2 seconds.
    # Choose a window that crosses the 2.0 second boundary.
    start = 1.9
    end = 2.1
    t = next_start_time(start, end, tm, "next_bar")
    assert t is not None
    # Expect the returned time to be close to 2.0 seconds.
    assert abs(t - 2.0) < 1e-3


def test_next_beat_when_window_crosses_beat_boundary() -> None:
    tm = TempoMap(bpm=120.0, ppq=480, sample_rate=44100.0)
    # At 120 BPM, one quarter note (beat) is 0.5 seconds.
    start = 0.49
    end = 0.6
    t = next_start_time(start, end, tm, "next_beat")
    assert t is not None
    assert abs(t - 0.5) < 1e-3


def test_no_start_when_window_does_not_cross_boundary() -> None:
    tm = TempoMap(bpm=120.0, ppq=480, sample_rate=44100.0)
    # Entirely inside a beat; should not start.
    start = 0.1
    end = 0.2
    assert next_start_time(start, end, tm, "next_beat") is None
    # Entirely inside a bar; should not start for next_bar.
    assert next_start_time(start, end, tm, "next_bar") is None


def test_invalid_policy_raises() -> None:
    tm = TempoMap()
    try:
        next_start_time(0.0, 1.0, tm, "unknown")  # type: ignore[arg-type]
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for unsupported policy")

