from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from midi_service.export.model import parse_export_request
from midi_service.services.export import run_export_sync


def _write_completed_job(output_dir: Path, job_id: str, notes: list[dict]) -> None:
    job_dir = output_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    progress = {
        "status": "completed",
        "job_id": job_id,
        "result": {"piano_roll_notes": notes},
    }
    (job_dir / "progress.json").write_text(json.dumps(progress), encoding="utf-8")


def test_run_export_sync_generates_zip(tmp_path: Path) -> None:
    source_job_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    notes = [{"pitch": 60, "start": 0.0, "duration": 0.5, "velocity": 88}]
    _write_completed_job(tmp_path, source_job_id, notes)

    request = parse_export_request(
        {
            "mode": "stems",
            "selected_stems": ["vocals"],
            "source_jobs": [{"job_id": source_job_id, "stem_name": "vocals", "bpm": 120}],
        }
    )

    export_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    export_dir = tmp_path / export_id
    export_dir.mkdir(parents=True, exist_ok=True)

    run_export_sync(export_id, export_dir, request, tmp_path)

    archive = export_dir / "stems.zip"
    assert archive.is_file()
    with zipfile.ZipFile(archive, "r") as zf:
        assert "vocals.mid" in zf.namelist()

    progress = json.loads((export_dir / "progress.json").read_text(encoding="utf-8"))
    assert progress["status"] == "completed"


def test_run_export_sync_rejects_unfinished_source(tmp_path: Path) -> None:
    source_job_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    source_dir = tmp_path / source_job_id
    source_dir.mkdir(parents=True, exist_ok=True)
    (source_dir / "progress.json").write_text(
        json.dumps({"status": "processing", "job_id": source_job_id}),
        encoding="utf-8",
    )

    request = parse_export_request(
        {
            "mode": "stems",
            "selected_stems": ["drums"],
            "source_jobs": [{"job_id": source_job_id, "stem_name": "drums"}],
        }
    )
    export_id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    export_dir = tmp_path / export_id
    export_dir.mkdir(parents=True, exist_ok=True)

    with pytest.raises(ValueError, match="not completed"):
        run_export_sync(export_id, export_dir, request, tmp_path)


def test_run_export_sync_mixdown_mode(tmp_path: Path) -> None:
    vocals_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    bass_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    notes_a = [{"pitch": 60, "start": 0.0, "duration": 0.5, "velocity": 88}]
    notes_b = [{"pitch": 48, "start": 0.25, "duration": 0.5, "velocity": 80}]
    _write_completed_job(tmp_path, vocals_id, notes_a)
    _write_completed_job(tmp_path, bass_id, notes_b)

    request = parse_export_request(
        {
            "mode": "mixdown",
            "format": "midi1",
            "selected_stems": ["vocals", "bass"],
            "source_jobs": [
                {"job_id": vocals_id, "stem_name": "vocals", "bpm": 120},
                {"job_id": bass_id, "stem_name": "bass", "bpm": 120},
            ],
        }
    )

    export_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    export_dir = tmp_path / export_id
    export_dir.mkdir(parents=True, exist_ok=True)

    run_export_sync(export_id, export_dir, request, tmp_path)

    archive = export_dir / "mixdown.zip"
    assert archive.is_file()
    with zipfile.ZipFile(archive, "r") as zf:
        assert "mixdown.mid" in zf.namelist()
