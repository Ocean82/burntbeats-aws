from __future__ import annotations

import json

from midi_service.services.storage import (
    STORAGE_SENTINEL_FILENAME,
    probe_storage,
    safe_job_path,
    write_metadata,
    write_progress,
    write_storage_sentinel,
)


def test_probe_storage_reports_ready_directory(tmp_path):
    storage = probe_storage(tmp_path, create_if_missing=True)

    assert storage["ok"] is True
    assert storage["output_dir"] == str(tmp_path)
    assert storage["resolved_output_dir"] == str(tmp_path.resolve())
    assert storage["can_read"] is True
    assert storage["can_write"] is True
    assert storage["sentinel_filename"] == STORAGE_SENTINEL_FILENAME


def test_safe_job_path_stays_under_storage_root(tmp_path):
    job_path = safe_job_path(tmp_path, "job-123", "progress.json")

    assert job_path == (tmp_path / "job-123" / "progress.json").resolve()


def test_write_progress_and_metadata_use_expected_filenames(tmp_path):
    out_dir = tmp_path / "job-123"
    out_dir.mkdir(parents=True, exist_ok=True)

    write_progress(out_dir, {"status": "queued", "job_id": "job-123"})
    write_metadata(out_dir, {"job_id": "job-123", "user_id": "user-123"})

    assert json.loads((out_dir / "progress.json").read_text(encoding="utf-8")) == {
        "status": "queued",
        "job_id": "job-123",
    }
    assert json.loads((out_dir / "metadata.json").read_text(encoding="utf-8")) == {
        "job_id": "job-123",
        "user_id": "user-123",
    }


def test_write_storage_sentinel_persists_service_alignment_metadata(tmp_path):
    storage = probe_storage(tmp_path, create_if_missing=True)

    write_storage_sentinel(tmp_path, storage)

    sentinel_payload = json.loads(
        (tmp_path / STORAGE_SENTINEL_FILENAME).read_text(encoding="utf-8")
    )
    assert sentinel_payload["output_dir"] == str(tmp_path)
    assert sentinel_payload["resolved_output_dir"] == str(tmp_path.resolve())
    assert sentinel_payload["service"] == "midi_service"
    assert "updated_at" in sentinel_payload
