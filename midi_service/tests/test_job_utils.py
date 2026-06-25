from __future__ import annotations

import sys
import types

import pytest

from midi_service import job_utils


def test_safe_job_path_blocks_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(job_utils, "MIDI_OUTPUT_DIR", tmp_path)

    with pytest.raises(ValueError, match="Path traversal"):
        job_utils.safe_job_path("job-1", "..", "..", "escape.txt")


def test_validate_audio_file_rejects_unsupported_extension(tmp_path):
    xyz_path = tmp_path / "recording.xyz"
    xyz_path.write_bytes(b"x" * 300)

    with pytest.raises(ValueError, match=r"Unsupported format \.xyz"):
        job_utils.validate_audio_file(xyz_path)


def test_validate_audio_file_rejects_sample_rate_out_of_range(tmp_path, monkeypatch):
    wav_path = tmp_path / "recording.wav"
    wav_path.write_bytes(b"x" * 300)

    fake_soundfile = types.SimpleNamespace(
        info=lambda _path: types.SimpleNamespace(samplerate=4000)
    )
    monkeypatch.setitem(sys.modules, "soundfile", fake_soundfile)

    with pytest.raises(ValueError, match="Sample rate 4000Hz"):
        job_utils.validate_audio_file(wav_path)
