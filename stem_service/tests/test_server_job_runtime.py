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


def test_split_worker_count_env_parsing(monkeypatch) -> None:
    monkeypatch.setenv("SPLIT_MAX_CONCURRENCY", "3")
    assert server._split_worker_count() == 3

    monkeypatch.setenv("SPLIT_MAX_CONCURRENCY", "0")
    assert server._split_worker_count() == 1

    monkeypatch.setenv("SPLIT_MAX_CONCURRENCY", "bad")
    assert server._split_worker_count() == 1


def test_run_separation_sync_quality_does_not_use_uninitialized_model_tier(monkeypatch) -> None:
    job_id = "00000000-0000-0000-0000-000000000001"
    out_dir = server.OUTPUT_BASE / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    input_path.write_bytes(b"not-a-real-wav")

    vocal_path = stems_dir / "vocals.wav"
    inst_path = stems_dir / "instrumental.wav"
    vocal_path.write_bytes(b"v")
    inst_path.write_bytes(b"i")

    monkeypatch.setattr(server, "STEM_BACKEND", "hybrid")

    def fake_run_hybrid_2stem(*_args, **_kwargs):
        return [("vocals", vocal_path), ("instrumental", inst_path)], ["fake-model"]

    monkeypatch.setattr(server, "run_hybrid_2stem", fake_run_hybrid_2stem)
    monkeypatch.setattr(server, "upload_job_stems_to_s3", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(server, "_append_metrics_log", lambda *_args, **_kwargs: None)

    # Regression assertion: this call used to raise UnboundLocalError for model_tier.
    server._run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=False,
        quality_mode="quality",
    )

    progress = (out_dir / server.PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress


def test_run_separation_sync_schedules_s3_upload_async(monkeypatch) -> None:
    job_id = "00000000-0000-0000-0000-000000000002"
    out_dir = server.OUTPUT_BASE / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    input_path.write_bytes(b"not-a-real-wav")

    vocal_path = stems_dir / "vocals.wav"
    inst_path = stems_dir / "instrumental.wav"
    vocal_path.write_bytes(b"v")
    inst_path.write_bytes(b"i")

    monkeypatch.setattr(server, "STEM_BACKEND", "hybrid")
    monkeypatch.setattr(
        server,
        "run_hybrid_2stem",
        lambda *_args, **_kwargs: ([("vocals", vocal_path), ("instrumental", inst_path)], ["fake-model"]),
    )
    monkeypatch.setattr(server, "_append_metrics_log", lambda *_args, **_kwargs: None)

    scheduled: dict[str, object] = {}

    def fake_schedule(job_id_arg, stems_dir_arg, out_dir_arg, progress_data_arg):
        scheduled["job_id"] = job_id_arg
        scheduled["stems_dir"] = stems_dir_arg
        scheduled["out_dir"] = out_dir_arg
        scheduled["progress_data"] = progress_data_arg

    monkeypatch.setattr(server, "_schedule_s3_upload", fake_schedule)

    server._run_separation_sync(
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
    progress = (out_dir / server.PROGRESS_FILENAME).read_text(encoding="utf-8")
    assert '"status": "completed"' in progress
