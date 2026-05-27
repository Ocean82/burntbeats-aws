from __future__ import annotations

from midi_service.timing.tempo_map import TempoMap


def test_tick_seconds_round_trip_constant_tempo() -> None:
    tm = TempoMap(bpm=120.0, ppq=480, sample_rate=44100.0)
    for ticks in (0.0, 120.0, 480.0, 960.0, 1920.0):
        seconds = tm.tick_to_seconds(ticks)
        round_trip_ticks = tm.seconds_to_tick(seconds)
        assert round(round_trip_ticks - ticks, 6) == 0.0


def test_ticks_samples_round_trip() -> None:
    tm = TempoMap(bpm=90.0, ppq=480, sample_rate=48_000.0)
    for ticks in (0.0, 240.0, 480.0, 960.0):
        samples = tm.tick_to_samples(ticks)
        rt_ticks = tm.samples_to_tick(samples)
        assert abs(rt_ticks - ticks) < 1e-3


def test_invalid_parameters_raise() -> None:
    for bpm in (0.0, -10.0):
        try:
            TempoMap(bpm=bpm)
        except ValueError:
            pass
        else:
            raise AssertionError("expected ValueError for invalid bpm")

    for ppq in (0, -1):
        try:
            TempoMap(ppq=ppq)
        except ValueError:
            pass
        else:
            raise AssertionError("expected ValueError for invalid ppq")

    for sr in (0.0, -44_100.0):
        try:
            TempoMap(sample_rate=sr)
        except ValueError:
            pass
        else:
            raise AssertionError("expected ValueError for invalid sample_rate")

