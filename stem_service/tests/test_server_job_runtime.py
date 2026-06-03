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
os.environ["INTERNAL_SERVICE_AUTH_REQUIRED"] = "0"

from stem_service import server  # noqa: E402
from stem_service import job_worker  # noqa: E402


def test_build_progress_payload_tracks_mode_specific_stage_labels() -> None:
    from stem_service.job_utils import build_progress_payload

    running = build_progress_payload(
        status="running",
        progress=94,
        stem_count=4,
        quality_mode="quality",
    )
    assert running["mode_name"] == "4_stem_quality"
    assert running["progress_stage"] == "splitting_accompaniment"
    assert running["progress_stage_label"] == "Splitting drums, bass & other…"

    queued_expand = build_progress_payload(
        status="queued",
        progress=0,
        stem_count=4,
        quality_mode="speed",
        job_type="expand",
        queue_position=2,
    )
    assert queued_expand["mode_name"] == "4_stem_speed"
    assert queued_expand["progress_stage"] == "queued"
    assert queued_expand["progress_stage_label"] == "Waiting to expand to 4 stems…"


def test_split_worker_count_env_parsing(monkeypatch) -> None:
    from stem_service.job_queue import split_worker_count

    monkeypatch.setenv("STEM_CPU_WORKERS", "2")
    assert split_worker_count() == 2

    monkeypatch.delenv("STEM_CPU_WORKERS")
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

    def fake_run_hybrid_2stem(*_args, **_kwargs):
        return [("vocals", vocal_path), ("instrumental", inst_path)], ["fake-model"]

    monkeypatch.setattr(
        "stem_service.routing.executor.run_hybrid_2stem", fake_run_hybrid_2stem
    )
    monkeypatch.setattr(job_worker, "_finalize_stems_to_16bit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        job_worker, "schedule_completion_artifacts", lambda *_args, **_kwargs: None
    )
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


def test_run_separation_sync_marks_local_ready_before_optional_artifacts(monkeypatch) -> None:
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

    monkeypatch.setattr(
        "stem_service.routing.executor.run_hybrid_2stem",
        lambda *_args, **_kwargs: (
            [("vocals", vocal_path), ("instrumental", inst_path)],
            ["fake-model"],
        ),
    )
    monkeypatch.setattr(job_worker, "_finalize_stems_to_16bit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)

    scheduled: dict[str, object] = {}

    def fake_schedule(**kwargs):
        scheduled.update(kwargs)

    monkeypatch.setattr(job_worker, "schedule_completion_artifacts", fake_schedule)

    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=True,
        quality_mode="speed",
    )

    assert scheduled["job_id"] == job_id
    assert scheduled["out_dir"] == out_dir
    assert scheduled["analysis_source"] == vocal_path
    from stem_service.job_utils import PROGRESS_FILENAME
    progress = (out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress
    assert '"artifact_delivery": "local_ready"' in progress
    assert '"mode_name": "2_stem_speed"' in progress
    assert '"progress_stage": "completed"' in progress
    assert '"progress_stage_label": "Stems ready"' in progress


def test_schedule_s3_upload_merges_s3_metadata_after_completion(monkeypatch) -> None:
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
    monkeypatch.setattr(
        "stem_service.job_utils.submit_background_task",
        lambda fn, **_: fn(),
    )
    write_progress(out_dir, progress_data)
    schedule_s3_upload(job_id, stems_dir, out_dir)

    data = json.loads((out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8"))
    assert data["status"] == "completed"
    assert data["artifact_delivery"] == "uploaded"
    assert data["s3"]["keys"]["vocals"] == s3_meta["keys"]["vocals"]
    assert data["s3"]["keys"]["instrumental"] == s3_meta["keys"]["instrumental"]


def test_run_separation_sync_ignores_demucs_only_2stem_backend_switch(monkeypatch) -> None:
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

    def fake_hybrid(*_a, **_k):
        called.append("hybrid")
        return [("vocals", vocal_path), ("instrumental", inst_path)], ["fake"]

    monkeypatch.setattr("stem_service.routing.executor.run_hybrid_2stem", fake_hybrid)
    monkeypatch.setattr(job_worker, "_finalize_stems_to_16bit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        job_worker, "schedule_completion_artifacts", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)

    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=False,
        quality_mode="quality",
    )

    assert called == ["hybrid"]
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
    monkeypatch.setattr(
        job_worker, "schedule_completion_artifacts", lambda *_args, **_kwargs: None
    )

    job_worker.run_expand_sync(
        expand_job_id=expand_job_id,
        source_job_id=source_job_id,
        out_dir=out_dir,
        prefer_speed=True,
        quality_mode="speed",
    )

    progress = (out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress
    assert '"beat_grid"' in progress
    assert '"confidence": 0.91' in progress
    assert '"job_type": "expand"' in progress
    assert '"mode_name": "4_stem_speed"' in progress
    assert '"progress_stage_label": "Expanded stems ready"' in progress
