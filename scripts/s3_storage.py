"""
S3 storage helper for uploading/managing generated audio files.
Config is read from environment variables (no backend.config dependency).

Required env vars (when S3_ENABLED=true):
  S3_ENABLED    - set to "true" to enable
  S3_BUCKET     - bucket name
  S3_REGION     - AWS region (default us-east-1)
  S3_PREFIX     - key prefix (default "stems")
  S3_ACCESS_KEY - optional; uses IAM role if not set
  S3_SECRET_KEY - optional; uses IAM role if not set
"""
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    boto3 = None
    ClientError = Exception
    BOTO3_AVAILABLE = False
    logger.warning("boto3 not available. S3 storage will be disabled.")


def _cfg():
    return {
        "enabled": os.environ.get("S3_ENABLED", "false").lower() == "true",
        "bucket": os.environ.get("S3_BUCKET", ""),
        "region": os.environ.get("S3_REGION", "us-east-1"),
        "prefix": os.environ.get("S3_PREFIX", "stems"),
        "access_key": os.environ.get("S3_ACCESS_KEY", ""),
        "secret_key": os.environ.get("S3_SECRET_KEY", ""),
    }


def get_s3_client():
    cfg = _cfg()
    if not BOTO3_AVAILABLE:
        raise ImportError("boto3 not installed: pip install boto3")
    if not cfg["enabled"]:
        raise ValueError("S3 not enabled. Set S3_ENABLED=true.")
    if not cfg["bucket"]:
        raise ValueError("S3_BUCKET not configured.")
    kwargs = {"region_name": cfg["region"]}
    if cfg["access_key"] and cfg["secret_key"]:
        kwargs["aws_access_key_id"] = cfg["access_key"]
        kwargs["aws_secret_access_key"] = cfg["secret_key"]
    return boto3.client("s3", **kwargs)


def get_s3_key(job_id: str, filename: str = "output.wav") -> str:
    prefix = _cfg()["prefix"].rstrip("/")
    return f"{prefix}/{job_id}/{filename}"


def upload_to_s3(file_path: Path, job_id: str, filename: Optional[str] = None) -> str:
    cfg = _cfg()
    if not cfg["enabled"]:
        raise ValueError("S3 not enabled.")
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    s3 = get_s3_client()
    key = get_s3_key(job_id, filename or file_path.name)
    logger.info("Uploading %s to s3://%s/%s", file_path, cfg["bucket"], key)
    s3.upload_file(
        str(file_path), cfg["bucket"], key,
        ExtraArgs={"ContentType": "audio/wav", "Metadata": {"job_id": job_id}},
    )
    url = f"s3://{cfg['bucket']}/{key}"
    logger.info("Uploaded: %s", url)
    return url


def download_from_s3(job_id: str, local_dir: Path, filename: Optional[str] = None) -> Path:
    cfg = _cfg()
    if not cfg["enabled"]:
        raise ValueError("S3 not enabled.")
    s3 = get_s3_client()
    fname = filename or "output.wav"
    key = get_s3_key(job_id, fname)
    local_dir.mkdir(parents=True, exist_ok=True)
    out = local_dir / fname
    logger.info("Downloading s3://%s/%s to %s", cfg["bucket"], key, out)
    try:
        s3.download_file(cfg["bucket"], key, str(out))
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            raise FileNotFoundError(f"Not found in S3: {key}")
        raise
    return out


def get_presigned_url(job_id: str, filename: Optional[str] = None, expiration: int = 3600) -> str:
    cfg = _cfg()
    if not cfg["enabled"]:
        raise ValueError("S3 not enabled.")
    s3 = get_s3_client()
    key = get_s3_key(job_id, filename or "output.wav")
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": cfg["bucket"], "Key": key},
        ExpiresIn=expiration,
    )


def file_exists_in_s3(job_id: str, filename: Optional[str] = None) -> bool:
    cfg = _cfg()
    if not cfg["enabled"]:
        return False
    try:
        s3 = get_s3_client()
        s3.head_object(Bucket=cfg["bucket"], Key=get_s3_key(job_id, filename or "output.wav"))
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        raise
