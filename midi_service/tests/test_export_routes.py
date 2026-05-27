from __future__ import annotations

from fastapi.testclient import TestClient

from midi_service.app import create_app
from midi_service.config import MIDI_SERVICE_API_TOKEN


def test_export_route_validates_payload(monkeypatch) -> None:
    monkeypatch.setenv("MIDI_SERVICE_API_TOKEN", "test-token")
    app = create_app()
    client = TestClient(app)

    headers = {"x-api-token": MIDI_SERVICE_API_TOKEN}

    # Missing stems should be rejected.
    r_bad = client.post("/export", headers=headers, json={"mode": "stems"})
    assert r_bad.status_code == 400

    # Minimal valid request.
    r_ok = client.post(
        "/export",
        headers=headers,
        json={"mode": "stems", "selected_stems": ["vocals", "drums"]},
    )
    assert r_ok.status_code == 200
    body = r_ok.json()
    assert body["mode"] == "stems"
    assert body["selected_stems"] == ["vocals", "drums"]

