"""
S3 storage module for uploading and managing generated audio files
"""
import os
import logging
from pathlib import Path
from typing import Optional
from backend.config import Config

logger = logging.getLogger(__name__)

# Try to import boto3
try:
    import boto3
    from botocore.exceptions import ClientError, BotoCoreError
    BOTO3_AVAILABLE = True
except ImportError:
    boto3 = None
    BotoCoreError = Exception
    ClientError = Exception
    BOTO3_AVAILABLE = False
    logger.warning("boto3 not available. S3 storage will be disabled.")


def get_s3_client():
    """Get S3 client instance"""
    if not BOTO3_AVAILABLE:
        raise ImportError("boto3 is not installed. Install it with: pip install boto3")
    
    if not Config.S3_ENABLED:
        raise ValueError("S3 is not enabled. Set S3_ENABLED=true in environment.")
    
    if not Config.S3_BUCKET:
        raise ValueError("S3_BUCKET is not configured")
    
    # Use credentials from environment or IAM role
    s3_kwargs = {
        "region_name": Config.S3_REGION
    }
    
    if Config.S3_ACCESS_KEY and Config.S3_SECRET_KEY:
        s3_kwargs["aws_access_key_id"] = Config.S3_ACCESS_KEY
        s3_kwargs["aws_secret_access_key"] = Config.S3_SECRET_KEY
    
    return boto3.client("s3", **s3_kwargs)


def get_s3_key(job_id: str, filename: str = "output_fixed.wav") -> str:
    """Generate S3 key for a job file"""
    prefix = Config.S3_PREFIX.rstrip("/")
    return f"{prefix}/{job_id}/{filename}"


def upload_to_s3(file_path: Path, job_id: str, filename: Optional[str] = None) -> str:
    """
    Upload a file to S3
    
    Args:
        file_path: Local file path to upload
        job_id: Job ID for organizing files
        filename: Optional filename (defaults to file_path.name)
        
    Returns:
        S3 URL of uploaded file
    """
    if not Config.S3_ENABLED:
        raise ValueError("S3 is not enabled")
    
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    try:
        s3_client = get_s3_client()
        s3_key = get_s3_key(job_id, filename or file_path.name)
        
        logger.info(f"Uploading {file_path} to S3: s3://{Config.S3_BUCKET}/{s3_key}")
        
        s3_client.upload_file(
            str(file_path),
            Config.S3_BUCKET,
            s3_key,
            ExtraArgs={
                "ContentType": "audio/wav",
                "Metadata": {
                    "job_id": job_id,
                    "original_filename": file_path.name
                }
            }
        )
        
        # Generate S3 URL
        s3_url = f"s3://{Config.S3_BUCKET}/{s3_key}"
        logger.info(f"Successfully uploaded to S3: {s3_url}")
        
        return s3_url
        
    except ClientError as e:
        logger.error(f"S3 upload error: {e}", exc_info=True)
        raise RuntimeError(f"Failed to upload to S3: {e}")
    except Exception as e:
        logger.error(f"Unexpected error uploading to S3: {e}", exc_info=True)
        raise


def download_from_s3(job_id: str, local_path: Path, filename: Optional[str] = None) -> Path:
    """
    Download a file from S3 to local path
    
    Args:
        job_id: Job ID
        local_path: Local directory to save file
        filename: Optional filename (defaults to output_fixed.wav)
        
    Returns:
        Path to downloaded file
    """
    if not Config.S3_ENABLED:
        raise ValueError("S3 is not enabled")
    
    try:
        s3_client = get_s3_client()
        s3_key = get_s3_key(job_id, filename or "output_fixed.wav")
        
        local_path.mkdir(parents=True, exist_ok=True)
        output_file = local_path / (filename or "output_fixed.wav")
        
        logger.info(f"Downloading from S3: s3://{Config.S3_BUCKET}/{s3_key} to {output_file}")
        
        s3_client.download_file(
            Config.S3_BUCKET,
            s3_key,
            str(output_file)
        )
        
        logger.info(f"Successfully downloaded from S3: {output_file}")
        return output_file
        
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            raise FileNotFoundError(f"File not found in S3: {s3_key}")
        logger.error(f"S3 download error: {e}", exc_info=True)
        raise RuntimeError(f"Failed to download from S3: {e}")
    except Exception as e:
        logger.error(f"Unexpected error downloading from S3: {e}", exc_info=True)
        raise


def delete_from_s3(job_id: str, filename: Optional[str] = None) -> bool:
    """
    Delete a file from S3
    
    Args:
        job_id: Job ID
        filename: Optional filename (defaults to output_fixed.wav)
        
    Returns:
        True if deleted, False if not found
    """
    if not Config.S3_ENABLED:
        raise ValueError("S3 is not enabled")
    
    try:
        s3_client = get_s3_client()
        s3_key = get_s3_key(job_id, filename or "output_fixed.wav")
        
        logger.info(f"Deleting from S3: s3://{Config.S3_BUCKET}/{s3_key}")
        
        s3_client.delete_object(
            Bucket=Config.S3_BUCKET,
            Key=s3_key
        )
        
        logger.info(f"Successfully deleted from S3: {s3_key}")
        return True
        
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            logger.warning(f"File not found in S3 (may already be deleted): {s3_key}")
            return False
        logger.error(f"S3 delete error: {e}", exc_info=True)
        raise RuntimeError(f"Failed to delete from S3: {e}")
    except Exception as e:
        logger.error(f"Unexpected error deleting from S3: {e}", exc_info=True)
        raise


def get_s3_presigned_url(job_id: str, filename: Optional[str] = None, expiration: int = 3600) -> str:
    """
    Generate a presigned URL for downloading from S3
    
    Args:
        job_id: Job ID
        filename: Optional filename (defaults to output_fixed.wav)
        expiration: URL expiration time in seconds (default: 1 hour)
        
    Returns:
        Presigned URL for direct download
    """
    if not Config.S3_ENABLED:
        raise ValueError("S3 is not enabled")
    
    try:
        s3_client = get_s3_client()
        s3_key = get_s3_key(job_id, filename or "output_fixed.wav")
        
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": Config.S3_BUCKET,
                "Key": s3_key
            },
            ExpiresIn=expiration
        )
        
        return url
        
    except Exception as e:
        logger.error(f"Error generating presigned URL: {e}", exc_info=True)
        raise RuntimeError(f"Failed to generate presigned URL: {e}")


def file_exists_in_s3(job_id: str, filename: Optional[str] = None) -> bool:
    """
    Check if a file exists in S3
    
    Args:
        job_id: Job ID
        filename: Optional filename (defaults to output_fixed.wav)
        
    Returns:
        True if file exists, False otherwise
    """
    if not Config.S3_ENABLED:
        return False
    
    try:
        s3_client = get_s3_client()
        s3_key = get_s3_key(job_id, filename or "output_fixed.wav")
        
        s3_client.head_object(
            Bucket=Config.S3_BUCKET,
            Key=s3_key
        )
        
        return True
        
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            return False
        logger.error(f"Error checking S3 file existence: {e}", exc_info=True)
        return False
    except Exception as e:
        logger.error(f"Unexpected error checking S3: {e}", exc_info=True)
        return False
