"""End-to-end tests for full stem separation job lifecycle with real audio files."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

TMP_OUTPUT_DIR = Path(tempfile.mkdtemp(prefix="burntbeats-e2e-"))
os.environ["STEM_OUTPUT_DIR"] = str(TMP_OUTPUT_DIR)
os.environ["NODE_ENV"] = "production"
os.environ["INTERNAL_SERVICE_AUTH_REQUIRED"] = "0"

import soundfile as sf
import numpy as np

from stem_service import job_worker
from stem_service.job_queue import JobQueue
from stem_service.job_utils import PROGRESS_FILENAME, build_progress_payload


@pytest.fixture(scope="session", autouse=True)
def _cleanup_tempdir() -> None:
    """Remove temp directory after all tests complete."""
    yield
    import shutil
    shutil.rmtree(TMP_OUTPUT_DIR, ignore_errors=True)


def _create_wav(path: Path, duration_sec: float = 2.0, sample_rate: int = 44100, amplitude: float = 0.3) -> None:
    """Create a 32-bit float WAV file with a 440 Hz sine tone at the given amplitude."""
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    tone = amplitude * np.sin(2 * np.pi * 440 * t)
    audio = np.column_stack([tone, tone]).astype(np.float32)
    sf.write(str(path), audio, sample_rate, subtype="FLOAT")


def get_audio_bitdepth(path: Path) -> int:
    """Return the bit depth of a WAV file by inspecting its subtype."""
    info = sf.info(str(path))
    if info.subtype == "PCM_16":
        return 16
    if info.subtype == "FLOAT":
        return 32
    if info.subtype == "PCM_24":
        return 24
    raise ValueError(f"Unexpected subtype: {info.subtype}")


def test_full_job_lifecycle_2stem_produces_16bit_output(monkeypatch) -> None:
    """Job with real audio creates 16-bit PCM stems and marks local_ready."""
    job_id = "e2e-2stem-16bit"
    out_dir = TMP_OUTPUT_DIR / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    _create_wav(input_path, duration_sec=2.0)

    vocal_path = stems_dir / "vocals.wav"
    inst_path = stems_dir / "instrumental.wav"
    _create_wav(vocal_path)
    _create_wav(inst_path)

    monkeypatch.setattr(
        "stem_service.routing.executor.run_hybrid_2stem",
        lambda *_args, **_kwargs: (
            [("vocals", vocal_path), ("instrumental", inst_path)],
            ["test-model"],
        ),
    )
    monkeypatch.setattr(
        job_worker, "schedule_completion_artifacts", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)

    jq = JobQueue()
    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=True,
        quality_mode="speed",
        job_queue=jq,
    )

    progress = json.loads((out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8"))
    assert progress["status"] == "completed"
    assert progress["artifact_delivery"] == "local_ready"
    assert len(progress["stems"]) == 2
    stem_ids = {s["id"] for s in progress["stems"]}
    assert stem_ids == {"vocals", "instrumental"}
    assert get_audio_bitdepth(vocal_path) == 16
    assert get_audio_bitdepth(inst_path) == 16


def test_full_job_lifecycle_4stem_produces_all_stems(monkeypatch) -> None:
    """4-stem job produces all requested stems and drops unrequested files."""
    job_id = "e2e-4stem-all"
    out_dir = TMP_OUTPUT_DIR / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    _create_wav(input_path, duration_sec=2.0)

    paths = {}
    for stem_id in ("vocals", "drums", "bass", "other"):
        p = stems_dir / f"{stem_id}.wav"
        _create_wav(p)
        paths[stem_id] = p
    paths["unused.wav"] = stems_dir / "unused.wav"
    _create_wav(paths["unused.wav"])

    monkeypatch.setattr(
        "stem_service.routing.executor.run_hybrid_4stem",
        lambda *_args, **_kwargs: (
            [
                ("vocals", paths["vocals"]),
                ("drums", paths["drums"]),
                ("bass", paths["bass"]),
                ("other", paths["other"]),
            ],
            ["test-model-4stem"],
        ),
    )
    monkeypatch.setattr(
        job_worker, "schedule_completion_artifacts", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)

    jq = JobQueue()
    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=4,
        prefer_speed=False,
        quality_mode="quality",
        job_queue=jq,
    )

    progress = json.loads((out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8"))
    assert progress["status"] == "completed"
    assert progress["mode_name"] == "4_stem_quality"
    stem_ids = {s["id"] for s in progress["stems"]}
    assert stem_ids == {"vocals", "drums", "bass", "other"}
    assert not (stems_dir / "unused.wav").exists()
    for stem_id in ("vocals", "drums", "bass", "other"):
        assert get_audio_bitdepth(paths[stem_id]) == 16


def test_full_job_lifecycle_s3_upload_merges_metadata(monkeypatch) -> None:
    """S3 upload metadata is merged into progress.json after completion."""
    from stem_service.job_utils import schedule_s3_upload, write_progress

    job_id = "e2e-s3-merge"
    out_dir = TMP_OUTPUT_DIR / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    _create_wav(stems_dir / "vocals.wav")
    _create_wav(stems_dir / "instrumental.wav")

    write_progress(
        out_dir,
        build_progress_payload(
            status="completed",
            progress=100,
            stem_count=2,
            quality_mode="quality",
        ),
    )

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

    schedule_s3_upload(job_id, stems_dir, out_dir)

    data = json.loads((out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8"))
    assert data["status"] == "completed"
    assert data["artifact_delivery"] == "uploaded"
    assert data["s3"]["keys"]["vocals"] == s3_meta["keys"]["vocals"]
    assert data["s3"]["keys"]["instrumental"] == s3_meta["keys"]["instrumental"]
    assert data["s3"]["bucket"] == "test-bucket"


def test_full_job_lifecycle_failed_job_reports_error(monkeypatch) -> None:
    """A failing pipeline produces a failed job status with error details."""
    job_id = "e2e-failed-job"
    out_dir = TMP_OUTPUT_DIR / job_id
    stems_dir = out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    input_path = out_dir / "input.wav"
    _create_wav(input_path, duration_sec=2.0)

    monkeypatch.setattr(
        "stem_service.routing.executor.run_hybrid_2stem",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("Model crashed")),
    )
    monkeypatch.setattr(job_worker, "append_metrics_log", lambda *_args, **_kwargs: None)

    jq = JobQueue()
    job_worker.run_separation_sync(
        job_id=job_id,
        input_path=input_path,
        out_dir=out_dir,
        stem_count=2,
        prefer_speed=True,
        quality_mode="speed",
        job_queue=jq,
    )

    progress = json.loads((out_dir / PROGRESS_FILENAME).read_text(encoding="utf-8"))
    assert progress["status"] == "failed"
    assert "error" in progress
    assert "Model crashed" in progress["error"]


def test_progress_callback_typeerror_propagates_other_errors() -> None:
    """Non-TypeError exceptions from progress callback are re-raised."""
    from stem_service.routing.executor import _call_progress

    class CustomError(Exception):
        pass

    def broken_callback(pct, job_kind=None):
        raise CustomError("callback failure")

    with pytest.raises(CustomError, match="callback failure"):
        _call_progress(broken_callback, 50, job_kind="hybrid_2")


def test_progress_callback_old_signature_handles_error() -> None:
    """TypeError from new signature falls back to old signature."""
    from stem_service.routing.executor import _call_progress

    calls = []

    def old_style_callback(pct):
        calls.append(pct)

    _call_progress(old_style_callback, 75, job_kind="hybrid_2")
    assert calls == [75]


def test_progress_callback_old_signature_re_raises_on_failure() -> None:
    """If old signature also fails, warning is logged and error re-raised."""
    from stem_service.routing.executor import _call_progress

    class OldError(Exception):
        pass

    def broken_old_callback(pct):
        raise OldError("old sig also fails")

    with pytest.raises(OldError, match="old sig also fails"):
        _call_progress(broken_old_callback, 50, job_kind="hybrid_2")
