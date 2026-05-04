import math
import sys
from pathlib import Path

import pytest

# Ensure repo root is on sys.path so `stem_service` resolves reliably.
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service import bpm_analysis


np = pytest.importorskip("numpy")
sf = pytest.importorskip("soundfile")


def _write_click_track(
    path: Path,
    *,
    bpm: float,
    duration_seconds: float,
    sr: int = 44100,
    click_width_samples: int = 128,
) -> None:
    samples = int(duration_seconds * sr)
    audio = np.zeros(samples, dtype=np.float32)
    interval = max(1, int((60.0 / bpm) * sr))
    for i in range(0, samples, interval):
        end = min(samples, i + click_width_samples)
        audio[i:end] = 1.0
    sf.write(str(path), audio, sr)


def test_estimate_bpm_numpy_fallback_detects_steady_tempo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    audio_path = tmp_path / "steady_120.wav"
    _write_click_track(audio_path, bpm=120.0, duration_seconds=20.0)

    monkeypatch.setattr(bpm_analysis, "_estimate_bpm_librosa", lambda *_args, **_kwargs: (_ for _ in ()).throw(ImportError("test")))
    result = bpm_analysis.estimate_bpm(audio_path)

    assert result is not None
    assert result["bpm"] == pytest.approx(120.0, abs=3.0)
    assert 0.0 <= result["confidence"] <= 1.0


def test_estimate_bpm_numpy_returns_low_confidence_for_silence(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    audio_path = tmp_path / "silence.wav"
    sf.write(str(audio_path), np.zeros(44100 * 5, dtype=np.float32), 44100)

    monkeypatch.setattr(bpm_analysis, "_estimate_bpm_librosa", lambda *_args, **_kwargs: (_ for _ in ()).throw(ImportError("test")))
    result = bpm_analysis.estimate_bpm(audio_path)

    assert result is not None
    assert result["confidence"] == 0.0


def test_estimate_bpm_numpy_sparse_hits_reduces_confidence(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    audio_path = tmp_path / "sparse.wav"
    samples = 44100 * 20
    audio = np.zeros(samples, dtype=np.float32)
    every_two_seconds = 44100 * 2
    for idx in range(0, samples, every_two_seconds):
        audio[idx : idx + 32] = 0.8
    sf.write(str(audio_path), audio, 44100)

    monkeypatch.setattr(bpm_analysis, "_estimate_bpm_librosa", lambda *_args, **_kwargs: (_ for _ in ()).throw(ImportError("test")))
    result = bpm_analysis.estimate_bpm(audio_path)

    assert result is not None
    assert result["confidence"] <= 0.5


def test_normalize_bpm_marks_out_of_range_as_uncertain() -> None:
    confidence_ref = {"value": 0.8}
    bpm = bpm_analysis._normalize_bpm_range(500.0, confidence_ref=confidence_ref)
    assert math.isfinite(bpm)
    assert confidence_ref["value"] == 0.0

