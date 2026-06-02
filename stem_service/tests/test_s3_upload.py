"""Tests for stem_service.s3_upload.upload_job_stems_to_s3."""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from stem_service import s3_upload


@pytest.fixture(autouse=True)
def _reset_env(monkeypatch):
    monkeypatch.delenv("S3_ENABLED", raising=False)
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.delenv("S3_PREFIX", raising=False)
    monkeypatch.delenv("S3_DELETE_LOCAL_AFTER_UPLOAD", raising=False)
    s3_upload.reset_s3_client_for_tests()
    yield
    s3_upload.reset_s3_client_for_tests()


def test_upload_skipped_when_disabled(tmp_path: Path) -> None:
    stems_dir = tmp_path / "stems"
    stems_dir.mkdir()
    (stems_dir / "vocals.wav").write_bytes(b"wav")
    assert s3_upload.upload_job_stems_to_s3("job-1", stems_dir) is None


def test_upload_skipped_when_bucket_missing(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("S3_ENABLED", "true")
    stems_dir = tmp_path / "stems"
    stems_dir.mkdir()
    (stems_dir / "vocals.wav").write_bytes(b"wav")
    assert s3_upload.upload_job_stems_to_s3("job-1", stems_dir) is None


def test_upload_happy_path(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("S3_ENABLED", "true")
    monkeypatch.setenv("S3_BUCKET", "test-bucket")
    monkeypatch.setenv("S3_PREFIX", "stems")
    monkeypatch.setenv("S3_REGION", "us-east-1")

    stems_dir = tmp_path / "stems"
    stems_dir.mkdir()
    (stems_dir / "vocals.wav").write_bytes(b"v")
    (stems_dir / "instrumental.wav").write_bytes(b"i")

    mock_client = MagicMock()
    with patch.object(s3_upload, "BOTO3_AVAILABLE", True), patch.object(
        s3_upload, "get_s3_client", return_value=mock_client
    ):
        meta = s3_upload.upload_job_stems_to_s3("00000000-0000-0000-0000-000000000001", stems_dir)

    assert meta is not None
    assert meta["bucket"] == "test-bucket"
    assert meta["region"] == "us-east-1"
    assert meta["keys"]["vocals"] == "stems/00000000-0000-0000-0000-000000000001/stems/vocals.wav"
    assert meta["keys"]["instrumental"] == (
        "stems/00000000-0000-0000-0000-000000000001/stems/instrumental.wav"
    )
    assert mock_client.upload_file.call_count == 2


def test_upload_partial_failure_still_returns_keys(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("S3_ENABLED", "true")
    monkeypatch.setenv("S3_BUCKET", "test-bucket")

    stems_dir = tmp_path / "stems"
    stems_dir.mkdir()
    (stems_dir / "vocals.wav").write_bytes(b"v")
    (stems_dir / "drums.wav").write_bytes(b"d")

    mock_client = MagicMock()

    def upload_side_effect(local_path, bucket, key, **kwargs):
        if key.endswith("drums.wav"):
            raise RuntimeError("upload failed")

    mock_client.upload_file.side_effect = upload_side_effect

    with patch.object(s3_upload, "BOTO3_AVAILABLE", True), patch.object(
        s3_upload, "get_s3_client", return_value=mock_client
    ):
        meta = s3_upload.upload_job_stems_to_s3("job-partial", stems_dir)

    assert meta is not None
    assert "vocals" in meta["keys"]
    assert "drums" not in meta["keys"]


def test_upload_empty_stems_dir(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("S3_ENABLED", "true")
    monkeypatch.setenv("S3_BUCKET", "test-bucket")
    stems_dir = tmp_path / "stems"
    stems_dir.mkdir()
    assert s3_upload.upload_job_stems_to_s3("job-empty", stems_dir) is None
