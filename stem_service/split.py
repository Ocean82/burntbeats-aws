"""
Stem separation using Demucs (htdemucs or demucs.extra bag), CPU-only.
Per AGENT-GUIDE: --shifts 0 (speed), --overlap 0.25, --segment for long-file stability.
Quality mode uses demucs.extra bag of models for better separation.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from stem_service.config import (
    MODELS_DIR,
    REPO_ROOT,
    USE_DEMUCS_SHIFTS_0,
    demucs_extra_available,
    ensure_htdemucs_th,
    get_demucs_quality_bag_config,
    htdemucs_available,
    DEMUCS_DEVICE,
)

# Demucs output layout: <out_dir>/htdemucs/<track_name>/{vocals,drums,bass,other}.wav
# With --two-stems=vocals: <out_dir>/htdemucs/<track_name>/{vocals,no_vocals}.wav
# With demucs.extra: <out_dir>/demucs.extra/<track_name>/{vocals,drums,bass,other}.wav

# CPU speed/quality: shifts=0 fastest; shifts=3-5 for best quality; segment (seconds) avoids OOM on long files
# Official htdemucs max segment is 7.8s; use 7 (int) to stay under.
# Larger segments = faster processing (less windowing overhead)
DEMUCS_SHIFTS_SPEED = 0
DEMUCS_SHIFTS_QUALITY = 3  # 3 shifts gives significant quality improvement over 1
DEMUCS_OVERLAP = 0.25
# htdemucs max segment is 7.8s; keep both <= 7 to stay under
DEMUCS_SEGMENT_SEC_SPEED = 7
DEMUCS_SEGMENT_SEC_QUALITY = 7
DEMUCS_SEGMENT_SEC = 7  # Default

# demucs.extra settings
DEMUCS_EXTRA_SEGMENT = 44  # From mdx_extra_q.yaml


def run_demucs(
    input_path: Path,
    output_dir: Path,
    stems: int = 4,
    prefer_speed: bool = True,
) -> list[tuple[str, Path]]:
    """
    Run demucs separation. Returns list of (stem_id, wav_path).
    stems: 2 -> vocals, instrumental; 4 -> vocals, drums, bass, other.
    prefer_speed=True: shifts=0 (fastest), uses htdemucs.
    prefer_speed=False: uses demucs.extra bag (if available) for best quality, else htdemucs with 3 shifts.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Determine which model to use
    use_extra = not prefer_speed and demucs_extra_available() and stems == 4

    if use_extra:
        # Use selected quality bag (mdx_extra_q or mdx_extra per DEMUCS_QUALITY_BAG)
        model_name, repo, segment, output_subdir = get_demucs_quality_bag_config()
        cmd = _build_demucs_cmd(
            input_path=input_path,
            output_dir=output_dir,
            model_name=model_name,
            shifts=0,  # Bag already averages multiple models
            segment=segment,
            repo=repo,
            two_stems=False,
        )
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
        if result.returncode != 0:
            raise RuntimeError(
                f"Demucs bag ({model_name}) failed: {result.stderr or result.stdout}"
            )
        track_name = input_path.stem
        base = output_dir / output_subdir / track_name
    else:
        # Use htdemucs
        if not htdemucs_available():
            raise FileNotFoundError(
                "Demucs model not found: put htdemucs.pth or htdemucs.th in models/. "
                "See README or scripts/copy-models.sh."
            )
        ensure_htdemucs_th()
        shifts = 0 if USE_DEMUCS_SHIFTS_0 else (DEMUCS_SHIFTS_SPEED if prefer_speed else DEMUCS_SHIFTS_QUALITY)
        # Use larger segments for speed mode (faster), smaller for quality (better)
        segment = (
            DEMUCS_SEGMENT_SEC_SPEED if prefer_speed else DEMUCS_SEGMENT_SEC_QUALITY
        )
        cmd = _build_demucs_cmd(
            input_path=input_path,
            output_dir=output_dir,
            model_name="htdemucs",
            shifts=shifts,
            segment=segment,
            repo=MODELS_DIR,
            two_stems=(stems == 2),
        )
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
        if result.returncode != 0:
            raise RuntimeError(f"demucs failed: {result.stderr or result.stdout}")
        track_name = input_path.stem
        base = output_dir / "htdemucs" / track_name

    if not base.exists():
        raise RuntimeError(f"demucs did not create output under {base}")

    stem_files: list[tuple[str, Path]] = []
    if stems == 2:
        for name in ("vocals", "no_vocals"):
            wav = base / f"{name}.wav"
            if wav.exists():
                stem_id = "instrumental" if name == "no_vocals" else name
                stem_files.append((stem_id, wav))
    else:
        for name in ("vocals", "drums", "bass", "other"):
            wav = base / f"{name}.wav"
            if wav.exists():
                stem_files.append((name, wav))

    return stem_files


def _build_demucs_cmd(
    input_path: Path,
    output_dir: Path,
    model_name: str,
    shifts: int,
    segment: int,
    repo: Path,
    two_stems: bool = False,
) -> list[str]:
    """Build demucs command arguments."""
    cmd: list[str] = [
        sys.executable,
        "-m",
        "demucs",
        "-n",
        model_name,
        "-o",
        str(output_dir),
        "-d",
        DEMUCS_DEVICE,
        "--shifts",
        str(shifts),
        "--overlap",
        str(DEMUCS_OVERLAP),
        "--segment",
        str(segment),
    ]
    cmd.extend(["--repo", str(repo)])
    if two_stems:
        cmd.extend(["--two-stems", "vocals"])
    cmd.append(str(input_path))
    return cmd


def copy_stems_to_flat_dir(
    stem_files: list[tuple[str, Path]],
    flat_dir: Path,
) -> list[tuple[str, Path]]:
    """Copy stem WAVs to a flat directory with predictable names. Returns (stem_id, path) in flat_dir."""
    flat_dir.mkdir(parents=True, exist_ok=True)
    out: list[tuple[str, Path]] = []
    for stem_id, src in stem_files:
        dest = flat_dir / f"{stem_id}.wav"
        shutil.copy2(src, dest)
        out.append((stem_id, dest))
    return out
