#!/usr/bin/env python3
"""
Disk space monitoring for stem separation service.
Checks tmp/stems/ and OS temp directory for uploads.
Can be run as a cron job or integrated into health checks.
"""

import os
import shutil
from pathlib import Path
import sys


def get_directory_size(path):
    """Get total size of directory in bytes."""
    total = 0
    try:
        for entry in os.scandir(path):
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_directory_size(entry.path)
    except OSError:
        pass  # Directory might not exist or be inaccessible
    return total


def format_bytes(bytes):
    """Format bytes to human readable format."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if bytes < 1024.0:
            return f"{bytes:.1f} {unit}"
        bytes /= 1024.0
    return f"{bytes:.1f} PB"


def check_disk_usage():
    """Check disk usage for critical directories."""
    # Get project root
    root = Path(__file__).resolve().parent.parent

    # Directories to monitor
    stems_dir = root / "tmp" / "stems"
    upload_temp_dir = Path(
        os.environ.get(
            "UPLOAD_TMP_DIR", os.path.join(os.sep, "tmp", "burntbeats-upload")
        )
    )

    # Thresholds (in bytes)
    WARNING_THRESHOLD = 2 * 1024 * 1024 * 1024  # 2 GB
    CRITICAL_THRESHOLD = 4 * 1024 * 1024 * 1024  # 4 GB

    print("=== Disk Space Monitoring ===")

    # Check stems directory
    if stems_dir.exists():
        stems_size = get_directory_size(stems_dir)
        print(f"Stems directory ({stems_dir}): {format_bytes(stems_size)}")

        if stems_size > CRITICAL_THRESHOLD:
            print(f"  🔴 CRITICAL: Exceeds {format_bytes(CRITICAL_THRESHOLD)}")
            return False
        elif stems_size > WARNING_THRESHOLD:
            print(f"  🟡 WARNING: Exceeds {format_bytes(WARNING_THRESHOLD)}")
    else:
        print(f"Stems directory ({stems_dir}): Not found")

    # Check upload temp directory
    if upload_temp_dir.exists():
        upload_size = get_directory_size(upload_temp_dir)
        print(f"Upload temp directory ({upload_temp_dir}): {format_bytes(upload_size)}")

        if upload_size > CRITICAL_THRESHOLD:
            print(f"  🔴 CRITICAL: Exceeds {format_bytes(CRITICAL_THRESHOLD)}")
            return False
        elif upload_size > WARNING_THRESHOLD:
            print(f"  🟡 WARNING: Exceeds {format_bytes(WARNING_THRESHOLD)}")
    else:
        print(f"Upload temp directory ({upload_temp_dir}): Not found")

    print("✅ Disk usage within acceptable limits")
    return True


def main():
    """Main function."""
    try:
        success = check_disk_usage()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"Error during disk space check: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
