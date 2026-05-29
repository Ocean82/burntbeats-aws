from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from midi_service.app import create_app
from midi_service.config import MIDI_OUTPUT_DIR, MIDI_SERVICE_API_TOKEN
from midi_service.services.storage import safe_job_path, write_progress


def test_delete_job_cancels_queued_job(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("MIDI_SERVICE_API_TOKEN", "test-token")
    monkeypatch.setenv("MIDI_OUTPUT_DIR", str(tmp_path))

    app = create_app()
    client = TestClient(app)

    job_id = "323e4567-e89b-12d3-a456-426614174222"
    job_dir = safe_job_path(MIDI_OUTPUT_DIR, job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    write_progress(
        job_dir,
        {
            "status": "queued",
            "job_id": job_id,
            "progress": 0,
            "message": "Waiting",
        },
    )

    headers = {"x-api-token": MIDI_SERVICE_API_TOKEN}
    response = client.delete(f"/jobs/{job_id}", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"

    progress = json.loads((job_dir / "progress.json").read_text(encoding="utf-8"))
    assert progress["status"] == "cancelled"


def test_delete_job_returns_409_for_completed_job(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("MIDI_SERVICE_API_TOKEN", "test-token")
    monkeypatch.setenv("MIDI_OUTPUT_DIR", str(tmp_path))

    app = create_app()
    client = TestClient(app)

    job_id = "423e4567-e89b-12d3-a456-426614174333"
    job_dir = safe_job_path(MIDI_OUTPUT_DIR, job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    write_progress(
        job_dir,
        {
            "status": "completed",
            "job_id": job_id,
            "progress": 100,
        },
    )

    headers = {"x-api-token": MIDI_SERVICE_API_TOKEN}
    response = client.delete(f"/jobs/{job_id}", headers=headers)
    assert response.status_code == 409
