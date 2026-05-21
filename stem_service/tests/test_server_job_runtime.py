import os
import sys
import tempfile
from pathlib import Path

# Ensure repo root is on sys.path so `stem_service` resolves reliably.
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

TMP_OUTPUT_DIR = Path(tempfile.mkdtemp(prefix="burntbeats-stem-runtime-"))
os.environ["STEM_OUTPUT_DIR"] = str(TMP_OUTPUT_DIR)
os.environ["NODE_ENV"] = "production"

from stem_service import server  # noqa: E402
from stem_service import job_worker  # noqa: E402


def test_split_worker_count_env_parsing(monkeypatch) -> None:
    from stem_service.job_queue import split_worker_count

    monkeypatch.setenv("SPLIT_MAX_CONCURRENCY", "3")
    assert split_worker_count() == 3

    monkeypatch.setenv("SPLIT_MAX_CONCURRENCY", "0")
    assert split_worker_count() == 1

    monkeypatch.setenv("SPLIT_MAX_CONCURRENCY", "bad")
    assert split_worker_count() == 1


def test_run_separation_sync_quality_does_not_use_uninitialized_model_tier(monkeypatch) -> None:
    job_id = "00000000-0000-0000-0000-000000000001"
    out_dir = job_worker.OUTPUT_BASE / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    input_path.write_bytes(b"not-a-real-wav")

    vocal_path = stems_dir / "vocals.wav"
    inst_path = stems_dir / "instrumental.wav"
    vocal_path.write_bytes(b"v")
    inst_path.write_bytes(b"i")

    monkeypatch.setattr(job_worker, "STEM_BACKEND", "hybrid")

    def fake_run_hybrid_2stem(*_args, **_kwargs):
        return [("vocals", vocal_path), ("instrumental", inst_path)], ["fake-model"]

    monkeypatch.setattr(job_worker, "run_hybrid_2stem", fake_run_hybrid_2stem)
    monkeypatch.setattr(job_worker, "schedule_s3_upload", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)

    # Regression assertion: this call used to raise UnboundLocalError for model_tier.
    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=False,
        quality_mode="quality",
    )

    from stem_service.job_utils import PROGRESS_FILENAME
    progress = (out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress


def test_run_separation_sync_schedules_s3_upload_async(monkeypatch) -> None:
    job_id = "00000000-0000-0000-0000-000000000002"
    out_dir = job_worker.OUTPUT_BASE / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    input_path.write_bytes(b"not-a-real-wav")

    vocal_path = stems_dir / "vocals.wav"
    inst_path = stems_dir / "instrumental.wav"
    vocal_path.write_bytes(b"v")
    inst_path.write_bytes(b"i")

    monkeypatch.setattr(job_worker, "STEM_BACKEND", "hybrid")
    monkeypatch.setattr(
        job_worker,
        "run_hybrid_2stem",
        lambda *_args, **_kwargs: ([("vocals", vocal_path), ("instrumental", inst_path)], ["fake-model"]),
    )
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)

    scheduled: dict[str, object] = {}

    def fake_schedule(job_id_arg, stems_dir_arg, out_dir_arg, progress_data_arg):
        scheduled["job_id"] = job_id_arg
        scheduled["stems_dir"] = stems_dir_arg
        scheduled["out_dir"] = out_dir_arg
        scheduled["progress_data"] = progress_data_arg

    monkeypatch.setattr(job_worker, "schedule_s3_upload", fake_schedule)

    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=True,
        quality_mode="speed",
    )

    assert scheduled["job_id"] == job_id
    assert scheduled["stems_dir"] == stems_dir
    assert scheduled["out_dir"] == out_dir
    assert isinstance(scheduled["progress_data"], dict)
    from stem_service.job_utils import PROGRESS_FILENAME
    progress = (out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress


def test_completed_progress_includes_s3_before_status_written(monkeypatch) -> None:
    """Regression: S3 metadata must be in progress.json when job completes (sync upload)."""
    import json

    from stem_service.job_utils import PROGRESS_FILENAME, schedule_s3_upload, write_progress

    job_id = "00000000-0000-0000-0000-000000000099"
    out_dir = job_worker.OUTPUT_BASE / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    (stems_dir / "vocals.wav").write_bytes(b"v")
    (stems_dir / "instrumental.wav").write_bytes(b"i")

    progress_data = {
        "status": "completed",
        "progress": 100,
        "stems": [
            {"id": "vocals", "path": "stems/vocals.wav"},
            {"id": "instrumental", "path": "stems/instrumental.wav"},
        ],
    }

    s3_meta = {
        "bucket": "test-bucket",
        "region": "us-east-1",
        "keys": {
            "vocals": f"stems/{job_id}/stems/vocals.wav",
            "instrumental": f"stems/{job_id}/stems/instrumental.wav",
        },
    }

    monkeypatch.setattr(
        "stem_service.job_utils.upload_job_stems_to_s3",
        lambda _jid, _dir: s3_meta,
    )
    schedule_s3_upload(job_id, stems_dir, out_dir, progress_data)
    write_progress(out_dir, progress_data)

    data = json.loads((out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8"))
    assert data["status"] == "completed"
    assert data["s3"]["keys"]["vocals"] == s3_meta["keys"]["vocals"]
    assert data["s3"]["keys"]["instrumental"] == s3_meta["keys"]["instrumental"]


def test_run_separation_sync_demucs_only_2stem_calls_demucs_only_helper(monkeypatch) -> None:
    job_id = "00000000-0000-0000-0000-000000000003"
    out_dir = job_worker.OUTPUT_BASE / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    input_path.write_bytes(b"not-a-real-wav")

    vocal_path = stems_dir / "vocals.wav"
    inst_path = stems_dir / "instrumental.wav"
    vocal_path.write_bytes(b"v")
    inst_path.write_bytes(b"i")

    called: list[str] = []

    def fake_demucs_only(*_a, **_k):
        called.append("demucs_only")
        return [("vocals", vocal_path), ("instrumental", inst_path)], ["htdemucs"]

    def fake_hybrid(*_a, **_k):
        called.append("hybrid")
        return [("vocals", vocal_path), ("instrumental", inst_path)], ["fake"]

    monkeypatch.setattr(job_worker, "STEM_BACKEND", "demucs_only")
    monkeypatch.setattr(job_worker, "run_demucs_only_2stem", fake_demucs_only)
    monkeypatch.setattr(job_worker, "run_hybrid_2stem", fake_hybrid)
    monkeypatch.setattr(job_worker, "schedule_s3_upload", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)

    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=False,
        quality_mode="quality",
    )

    assert "demucs_only" in called
    assert "hybrid" not in called
    from stem_service.job_utils import PROGRESS_FILENAME
    progress = (out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress


def test_run_expand_sync_inherits_beat_grid_from_source_progress(monkeypatch) -> None:
    source_job_id = "00000000-0000-0000-0000-000000000010"
    expand_job_id = "00000000-0000-0000-0000-000000000011"
    source_dir = job_worker.OUTPUT_BASE / source_job_id
    source_stems = source_dir / "stems"
    source_stems.mkdir(parents=True, exist_ok=True)
    from stem_service.job_utils import PROGRESS_FILENAME
    (source_dir / PROGRESS_FILENAME).write_text(
        '{"status":"completed","progress":100,"beat_grid":{"bpm":120.0,"beat_offset_seconds":0.25,"confidence":0.91}}',
        encoding="utf-8",
    )

    out_dir = job_worker.OUTPUT_BASE / expand_job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    vocal_path = stems_dir / "vocals.wav"
    drums_path = stems_dir / "drums.wav"
    bass_path = stems_dir / "bass.wav"
    other_path = stems_dir / "other.wav"
    for p in (vocal_path, drums_path, bass_path, other_path):
        p.write_bytes(b"x")

    monkeypatch.setattr(
        job_worker,
        "run_expand_to_4stem",
        lambda *_args, **_kwargs: (
            [
                ("vocals", vocal_path),
                ("drums", drums_path),
                ("bass", bass_path),
                ("other", other_path),
            ],
            ["fake-expand-model"],
        ),
    )
    monkeypatch.setattr(job_worker, "schedule_s3_upload", lambda *_args, **_kwargs: None)

    job_worker.run_expand_sync(
        expand_job_id=expand_job_id,
        source_job_id=source_job_id,
        out_dir=out_dir,
        prefer_speed=True,
    )

    progress = (out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress
    assert '"beat_grid"' in progress
    assert '"confidence": 0.91' in progress
