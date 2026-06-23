import os
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

# Ensure repo root is on sys.path so `stem_service` resolves reliably.
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

TMP_OUTPUT_DIR = Path(tempfile.mkdtemp(prefix="burntbeats-stem-output-"))

# Set env vars before importing the FastAPI app so module-level constants pick them up.
os.environ["STEM_OUTPUT_DIR"] = str(TMP_OUTPUT_DIR)
os.environ["NODE_ENV"] = "production"
os.environ["INTERNAL_SERVICE_AUTH_REQUIRED"] = "0"
os.environ["FRONTEND_ORIGINS"] = "http://localhost:5173,http://localhost"
os.environ["STEM_ALLOW_MISSING_HTDEMUCS"] = "1"

from stem_service.server import app  # noqa: E402

client = TestClient(app)


def test_health_production_omits_repo_root(monkeypatch) -> None:
    from stem_service import server

    monkeypatch.setattr(server, "_supported_mode_health_snapshot", lambda: {
        "all_ready": True,
        "supported_modes": {
            "2_stem_speed": {
                "ready": True,
                "required_models": ["UVR_MDXNET_3_9662.onnx"],
                "resolved_models": ["UVR_MDXNET_3_9662.ort"],
                "missing_models": [],
            },
            "2_stem_quality": {
                "ready": True,
                "required_models": ["UVR_MDXNET_KARA.onnx"],
                "resolved_models": ["UVR_MDXNET_KARA.ort"],
                "missing_models": [],
            },
            "4_stem_speed": {
                "ready": True,
                "required_models": [
                    "UVR_MDXNET_3_9662.onnx",
                    "UVR-MDX-NET-Drum.onnx",
                    "UVR-MDX-NET-Bass.onnx",
                ],
                "resolved_models": [
                    "UVR_MDXNET_3_9662.ort",
                    "UVR-MDX-NET-Drum.ort",
                    "UVR-MDX-NET-Bass.ort",
                ],
                "missing_models": [],
            },
            "4_stem_quality": {
                "ready": True,
                "required_models": [
                    "UVR_MDXNET_KARA.onnx",
                    "UVR-MDX-NET-Drum.onnx",
                    "UVR-MDX-NET-Bass.onnx",
                ],
                "resolved_models": [
                    "UVR_MDXNET_KARA.ort",
                    "UVR-MDX-NET-Drum.ort",
                    "UVR-MDX-NET-Bass.ort",
                ],
                "missing_models": [],
            },
        },
    })
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "repo_root" not in body
    assert "runtime" in body
    assert isinstance(body["runtime"], dict)
    assert "python" in body["runtime"]
    assert body["four_stem_backend"] in ("hybrid", "auto")
    assert body["supported_modes"]["4_stem_quality"]["ready"] is True


def test_status_invalid_job_id() -> None:
    response = client.get("/status/not-a-uuid")
    assert response.status_code == 400
    body = response.json()
    assert body["detail"] == "Invalid job_id"


def test_status_unknown_job_returns_404() -> None:
    unknown_job_id = "00000000-0000-0000-0000-000000000000"
    response = client.get(f"/status/{unknown_job_id}")
    assert response.status_code == 404
    body = response.json()
    assert body["detail"] == "Job not found"


def test_expand_enqueues_on_shared_heavy_job_queue(monkeypatch) -> None:
    from stem_service import server
    from stem_service.job_queue import JobQueue
    from stem_service.job_utils import OUTPUT_BASE
    from starlette.testclient import TestClient as TC

    source_job_id = "00000000-0000-0000-0000-000000000111"
    stems_dir = OUTPUT_BASE / source_job_id / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    (stems_dir / "vocals.wav").write_bytes(b"v")
    (stems_dir / "instrumental.wav").write_bytes(b"i")

    captured: dict[str, object] = {}

    async def fake_enqueue_expand_job(job):
        captured.update(job)
        return 3

    with TC(server.app) as tc:
        monkeypatch.setattr(server._job_queue, "enqueue_expand_job", fake_enqueue_expand_job)
        response = tc.post("/expand", data={"job_id": source_job_id, "quality": "speed"})

    assert response.status_code == 202
    body = response.json()
    assert body == {
        "job_id": body["job_id"],
        "status": "accepted",
        "queue_position": 3,
    }
    assert captured["job_type"] == "expand"
    assert captured["source_job_id"] == source_job_id
    assert captured["stem_count"] == 4
    assert captured["prefer_speed"] is True
    assert captured["quality_mode"] == "speed"


def test_run_queued_job_dispatches_expand_requests(monkeypatch) -> None:
    from stem_service import server

    calls: dict[str, tuple[object, ...]] = {}

    def fake_expand(*args):
        calls["expand"] = args

    monkeypatch.setattr(server, "_run_expand_sync", fake_expand)

    server._run_queued_job(
        {
            "job_type": "expand",
            "job_id": "00000000-0000-0000-0000-000000000222",
            "source_job_id": "00000000-0000-0000-0000-000000000111",
            "out_dir": TMP_OUTPUT_DIR / "queued-expand",
            "prefer_speed": False,
            "quality_mode": "quality",
            "correlation_id": "cid-1",
        }
    )

    assert calls["expand"][0] == "00000000-0000-0000-0000-000000000222"
    assert calls["expand"][1] == "00000000-0000-0000-0000-000000000111"
    assert calls["expand"][3] is False
    assert calls["expand"][4] == "quality"
    assert calls["expand"][5] == "cid-1"

