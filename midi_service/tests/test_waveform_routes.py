from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from midi_service.app import create_app
from midi_service.config import MIDI_OUTPUT_DIR, MIDI_SERVICE_API_TOKEN
from midi_service.services.storage import safe_job_path


def _make_test_audio(path: Path) -> None:
    sr = 44100
    t = np.linspace(0, 0.1, int(sr * 0.1), endpoint=False)
    tone = 0.5 * np.sin(2 * np.pi * 440 * t)
    sf.write(str(path), tone, sr)


def test_waveform_and_spectrum_endpoints(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("MIDI_SERVICE_API_TOKEN", "test-token")
    monkeypatch.setenv("MIDI_OUTPUT_DIR", str(tmp_path))

    app = create_app()
    client = TestClient(app)

    job_id = "123e4567-e89b-12d3-a456-426614174000"
    job_dir = safe_job_path(MIDI_OUTPUT_DIR, job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    audio_path = job_dir / "input.wav"
    _make_test_audio(audio_path)

    headers = {"x-api-token": MIDI_SERVICE_API_TOKEN}

    r_wave = client.get(f"/waveform/{job_id}", headers=headers)
    assert r_wave.status_code == 200
    body = r_wave.json()
    assert "data" in body and isinstance(body["data"], list)
    assert len(body["data"]) == body["points"]

    r_spec = client.get(f"/spectrum/{job_id}", headers=headers)
    assert r_spec.status_code == 200
    body_s = r_spec.json()
    assert "data" in body_s and isinstance(body_s["data"], list)
    assert len(body_s["data"]) > 0


def test_waveform_and_spectrum_endpoints_non_wav_input(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("MIDI_SERVICE_API_TOKEN", "test-token")
    monkeypatch.setenv("MIDI_OUTPUT_DIR", str(tmp_path))

    app = create_app()
    client = TestClient(app)

    job_id = "223e4567-e89b-12d3-a456-426614174111"
    job_dir = safe_job_path(MIDI_OUTPUT_DIR, job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    audio_path = job_dir / "input.flac"
    _make_test_audio(audio_path)

    headers = {"x-api-token": MIDI_SERVICE_API_TOKEN}

    r_wave = client.get(f"/waveform/{job_id}", headers=headers)
    assert r_wave.status_code == 200
    body = r_wave.json()
    assert "data" in body and isinstance(body["data"], list)
    assert len(body["data"]) == body["points"]

    r_spec = client.get(f"/spectrum/{job_id}", headers=headers)
    assert r_spec.status_code == 200
    body_s = r_spec.json()
    assert "data" in body_s and isinstance(body_s["data"], list)
    assert len(body_s["data"]) > 0

