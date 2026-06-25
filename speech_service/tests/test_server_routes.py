"""Tests for speech_service HTTP routes (health, enhance, status, file)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

os.environ.setdefault("NODE_ENV", "test")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_REQUIRED", "0")

from speech_service.server import app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    output_dir = tmp_path / "speech-output"
    output_dir.mkdir(parents=True, exist_ok=True)

    import speech_service.config as cfg
    import speech_service.job_utils as ju
    import speech_service.server as srv

    orig_cfg = cfg.SPEECH_OUTPUT_DIR
    cfg.SPEECH_OUTPUT_DIR = output_dir
    srv.SPEECH_OUTPUT_DIR = output_dir
    ju.SPEECH_OUTPUT_DIR = output_dir

    with (
        patch("speech_service.server.verify_models_at_startup"),
        patch("speech_service.server.start_worker"),
        patch("speech_service.server.stop_worker"),
    ):
        with TestClient(app) as c:
            yield c

    cfg.SPEECH_OUTPUT_DIR = orig_cfg


class TestHealth:
    def test_health_returns_ok(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert "version" in body
        assert "uptime_seconds" in body
        assert "queue_depth" in body


class TestEnhance:
    def test_enhance_accepts_valid_wav(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        import speech_service.server as srv

        async def fake_enqueue(item: dict) -> None:
            pass

        monkeypatch.setattr(srv, "enqueue_job", fake_enqueue)

        import soundfile as sf
        import numpy as np

        wav_path = Path(client.base_url.path or ".") / "test.wav"
        sf.write(str(wav_path), np.zeros((16000,), dtype=np.float32), 16000, subtype="PCM_16")

        with wav_path.open("rb") as f:
            resp = client.post("/enhance", files={"file": ("test.wav", f, "audio/wav")})

        assert resp.status_code == 202
        body = resp.json()
        assert body["status"] == "queued"
        assert "job_id" in body

    def test_enhance_rejects_invalid_file(self, client: TestClient) -> None:
        resp = client.post(
            "/enhance",
            files={"file": ("bad.txt", b"not an audio file", "text/plain")},
        )
        assert resp.status_code == 400

    def test_enhance_rejects_empty_file(self, client: TestClient) -> None:
        resp = client.post(
            "/enhance",
            files={"file": ("empty.wav", b"", "audio/wav")},
        )
        assert resp.status_code == 400

    def test_enhance_returns_503_when_queue_full(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        import speech_service.server as srv

        async def fake_enqueue_full(item: dict) -> None:
            raise RuntimeError("Speech queue is full")

        monkeypatch.setattr(srv, "enqueue_job", fake_enqueue_full)

        import soundfile as sf
        import numpy as np

        wav_path = Path(client.base_url.path or ".") / "queue-test.wav"
        sf.write(str(wav_path), np.zeros((16000,), dtype=np.float32), 16000, subtype="PCM_16")

        with wav_path.open("rb") as f:
            resp = client.post("/enhance", files={"file": ("queuetest.wav", f, "audio/wav")})

        assert resp.status_code == 503
        assert "queue is full" in resp.json()["detail"]


class TestStatus:
    def test_status_returns_progress(self, client: TestClient, tmp_path: Path) -> None:
        import speech_service.config as cfg

        job_id = "00000000-0000-0000-0000-000000000001"
        job_dir = cfg.SPEECH_OUTPUT_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        progress = {"status": "completed", "job_id": job_id, "progress": 100}
        (job_dir / "progress.json").write_text(json.dumps(progress), encoding="utf-8")

        resp = client.get(f"/status/{job_id}")
        assert resp.status_code == 200
        assert resp.json() == progress

    def test_status_invalid_uuid(self, client: TestClient) -> None:
        resp = client.get("/status/not-a-uuid")
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid job_id"

    def test_status_unknown_job(self, client: TestClient) -> None:
        resp = client.get("/status/00000000-0000-0000-0000-000000000099")
        assert resp.status_code == 404


class TestFile:
    def test_file_download(self, client: TestClient) -> None:
        import speech_service.config as cfg

        job_id = "00000000-0000-0000-0000-000000000002"
        job_dir = cfg.SPEECH_OUTPUT_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        (job_dir / "enhanced.wav").write_bytes(b"fake-wav-content")

        resp = client.get(f"/file/{job_id}/enhanced.wav")
        assert resp.status_code == 200
        assert resp.content == b"fake-wav-content"

    def test_file_unknown_job(self, client: TestClient) -> None:
        resp = client.get("/file/00000000-0000-0000-0000-000000000003/enhanced.wav")
        assert resp.status_code == 404

    def test_file_invalid_uuid(self, client: TestClient) -> None:
        resp = client.get("/file/bad-id/enhanced.wav")
        assert resp.status_code == 400

    def test_file_unknown_filename(self, client: TestClient) -> None:
        import speech_service.config as cfg

        job_id = "00000000-0000-0000-0000-000000000004"
        job_dir = cfg.SPEECH_OUTPUT_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        (job_dir / "enhanced.wav").write_bytes(b"data")

        resp = client.get(f"/file/{job_id}/other.wav")
        assert resp.status_code == 400

    def test_file_not_ready(self, client: TestClient) -> None:
        import speech_service.config as cfg

        job_id = "00000000-0000-0000-0000-000000000005"
        job_dir = cfg.SPEECH_OUTPUT_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        (job_dir / "progress.json").write_text('{"status":"processing"}', encoding="utf-8")

        resp = client.get(f"/file/{job_id}/enhanced.wav")
        assert resp.status_code == 404
