from __future__ import annotations

import json
from pathlib import Path


def _write_source_job(output_dir: Path, job_id: str, notes: list[dict]) -> None:
    job_dir = output_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": "completed",
        "job_id": job_id,
        "result": {"piano_roll_notes": notes},
    }
    (job_dir / "progress.json").write_text(json.dumps(payload), encoding="utf-8")


async def test_export_route_validates_payload(client_factory) -> None:
    async with client_factory(service_api_token="secret-token") as client:
        headers = {"X-Midi-Service-Token": "secret-token"}
        r_bad = await client.post("/export", headers=headers, json={"mode": "stems"})
        assert r_bad.status_code == 400


async def test_export_lifecycle_and_file_download(client_factory) -> None:
    async with client_factory(service_api_token="secret-token") as client:
        headers = {"X-Midi-Service-Token": "secret-token"}
        output_dir = Path(getattr(client, "_test_midi_output_dir"))

        source_a = "11111111-1111-4111-8111-111111111111"
        source_b = "22222222-2222-4222-8222-222222222222"
        notes_a = [{"pitch": 60, "start": 0.0, "duration": 0.5, "velocity": 90}]
        notes_b = [{"pitch": 64, "start": 0.2, "duration": 0.6, "velocity": 95}]
        _write_source_job(output_dir, source_a, notes_a)
        _write_source_job(output_dir, source_b, notes_b)

        request = {
            "mode": "stems",
            "selected_stems": ["vocals", "drums"],
            "source_jobs": [
                {"job_id": source_a, "stem_name": "vocals"},
                {"job_id": source_b, "stem_name": "drums"},
            ],
            "format": "midi1",
        }
        created = await client.post("/export", headers=headers, json=request)
        assert created.status_code == 202
        export_id = created.json()["export_id"]

        status = await client.get(f"/export/status/{export_id}", headers=headers)
        assert status.status_code == 200
        assert status.json()["status"] == "completed"
        assert status.json()["result"]["archive"] == "stems.zip"

        archive = await client.get(f"/export/file/{export_id}/stems.zip", headers=headers)
        assert archive.status_code == 200
        assert archive.headers["content-type"].startswith("application/zip")
        assert len(archive.content) > 0

        not_allowed = await client.get(
            f"/export/file/{export_id}/not-real.zip", headers=headers
        )
        assert not_allowed.status_code == 400

