"""
Upload stem WAVs to S3 after a job completes. Same env contract as scripts/s3_storage.py.

Keys: {S3_PREFIX}/{job_id}/stems/{filename}  e.g. stems/uuid/stems/vocals.wav
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.exceptions import ClientError

    BOTO3_AVAILABLE = True
except ImportError:
    boto3 = None
    ClientError = Exception
    BOTO3_AVAILABLE = False


def _cfg() -> dict[str, str]:
    return {
        "enabled": os.environ.get("S3_ENABLED", "").lower() == "true",
        "bucket": os.environ.get("S3_BUCKET", ""),
        "region": os.environ.get(
            "S3_REGION", os.environ.get("AWS_REGION", "us-east-1")
        ),
        "prefix": os.environ.get("S3_PREFIX", "stems").rstrip("/"),
        "access_key": os.environ.get("S3_ACCESS_KEY", ""),
        "secret_key": os.environ.get("S3_SECRET_KEY", ""),
    }


def _client():
    if not BOTO3_AVAILABLE:
        raise ImportError("boto3 is required for S3 upload: pip install boto3")
    cfg = _cfg()
    kwargs: dict[str, Any] = {"region_name": cfg["region"]}
    if cfg["access_key"] and cfg["secret_key"]:
        kwargs["aws_access_key_id"] = cfg["access_key"]
        kwargs["aws_secret_access_key"] = cfg["secret_key"]
    return boto3.client("s3", **kwargs)


def upload_job_stems_to_s3(job_id: str, stems_dir: Path) -> dict[str, Any] | None:
    """
    Upload all *.wav under stems_dir to S3. Returns metadata for progress.json, or None if skipped/failed.
    """
    cfg = _cfg()
    if not cfg["enabled"]:
        return None
    if not cfg["bucket"]:
        logger.warning("S3_ENABLED but S3_BUCKET not set; skipping upload")
        return None
    if not stems_dir.is_dir():
        logger.warning("S3 upload: stems dir missing %s", stems_dir)
        return None

    wavs = sorted(stems_dir.glob("*.wav"))
    if not wavs:
        logger.warning("S3 upload: no wav files in %s", stems_dir)
        return None

    try:
        s3 = _client()
    except ImportError as e:
        logger.warning("S3 upload skipped: %s", e)
        return None

    prefix = cfg["prefix"]
    keys: dict[str, str] = {}
    bucket = cfg["bucket"]
    errors: list[str] = []

    for wav in wavs:
        stem_id = wav.stem
        key = f"{prefix}/{job_id}/stems/{wav.name}"
        try:
            s3.upload_file(
                str(wav),
                bucket,
                key,
                ExtraArgs={
                    "ContentType": "audio/wav",
                    "Metadata": {"job_id": job_id, "stem_id": stem_id},
                },
            )
            keys[stem_id] = key
            logger.info("Uploaded s3://%s/%s", bucket, key)
        except ClientError as e:
            logger.exception("S3 upload failed for %s: %s", wav, e)
            errors.append(f"{stem_id}: {e}")

    if not keys:
        logger.error("S3 upload: all %d files failed for job %s", len(wavs), job_id)
        return None

    if errors:
        logger.warning(
            "S3 upload partial: %d/%d failed for job %s: %s",
            len(errors),
            len(wavs),
            job_id,
            "; ".join(errors),
        )

    out: dict[str, Any] = {
        "bucket": bucket,
        "region": cfg["region"],
        "keys": keys,
    }

    if os.environ.get("S3_DELETE_LOCAL_AFTER_UPLOAD", "").lower() == "true":
        for wav in wavs:
            try:
                wav.unlink()
                logger.info("Removed local after S3 upload: %s", wav)
            except OSError as e:
                logger.warning("Could not delete local %s: %s", wav, e)

    return out
