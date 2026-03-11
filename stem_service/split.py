"""
Stem separation using Demucs (htdemucs), CPU-only.
Per AGENT-GUIDE: --shifts 0 (speed), --overlap 0.25, --segment for long-file stability.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from stem_service.config import MODELS_DIR, REPO_ROOT, ensure_htdemucs_th, htdemucs_available

# Demucs output layout: <out_dir>/htdemucs/<track_name>/{vocals,drums,bass,other}.wav
# With --two-stems=vocals: <out_dir>/htdemucs/<track_name>/{vocals,no_vocals}.wav

# CPU speed/quality: shifts=0 fastest; segment (seconds) avoids OOM on long files
# Official htdemucs max segment is 7.8s; use 7 (int) to stay under.
DEMUCS_SHIFTS_SPEED = 0
DEMUCS_SHIFTS_QUALITY = 1
DEMUCS_OVERLAP = 0.25
DEMUCS_SEGMENT_SEC = 7


def run_demucs(
    input_path: Path,
    output_dir: Path,
    stems: int = 4,
    prefer_speed: bool = True,
) -> list[tuple[str, Path]]:
    """
    Run demucs separation. Returns list of (stem_id, wav_path).
    stems: 2 -> vocals, instrumental; 4 -> vocals, drums, bass, other.
    prefer_speed=True: shifts=0 (fastest). prefer_speed=False: shifts=1 (slightly better quality).
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not htdemucs_available():
        raise FileNotFoundError(
            "Demucs model not found: put htdemucs.pth or htdemucs.th in models/. "
            "See README or scripts/copy-models.sh."
        )
    ensure_htdemucs_th()

    shifts = DEMUCS_SHIFTS_SPEED if prefer_speed else DEMUCS_SHIFTS_QUALITY
    cmd: list[str] = [
        sys.executable,
        "-m",
        "demucs",
        "-n",
        "htdemucs",
        "-o",
        str(output_dir),
        "-d",
        "cpu",
        "--shifts",
        str(shifts),
        "--overlap",
        str(DEMUCS_OVERLAP),
        "--segment",
        str(DEMUCS_SEGMENT_SEC),
    ]
    cmd.extend(["--repo", str(MODELS_DIR)])
    if stems == 2:
        cmd.extend(["--two-stems", "vocals"])
    cmd.append(str(input_path))

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
    if result.returncode != 0:
        raise RuntimeError(f"demucs failed: {result.stderr or result.stdout}")

    # Demucs writes to output_dir/htdemucs/<track_name>/
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
