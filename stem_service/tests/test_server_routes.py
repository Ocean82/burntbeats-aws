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
os.environ["FRONTEND_ORIGINS"] = "http://localhost:5173,http://localhost"
os.environ["STEM_ALLOW_MISSING_HTDEMUCS"] = "1"

from stem_service.server import app  # noqa: E402

client = TestClient(app)


def test_health_production_omits_repo_root() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "repo_root" not in body
    assert "runtime" in body
    assert isinstance(body["runtime"], dict)
    assert "python" in body["runtime"]


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

