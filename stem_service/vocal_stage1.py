"""
Stage 1: Extract vocals (and optionally instrumental from same model).
Prefer ONNX vocal model when available; else Demucs 2-stem.
When Demucs is used, returns (vocals_path, no_vocals_path) so instrumental is model-native and phase-aligned.
When ONNX is used, returns (vocals_path, None); caller must create instrumental via phase inversion.
Per AGENT-GUIDE: segment_size 256, overlap 2 for ONNX; Demucs uses --shifts 0, --overlap 0.25.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from stem_service.config import (
    MODELS_DIR,
    REPO_ROOT,
    ensure_htdemucs_th,
    htdemucs_available,
    DEMUCS_DEVICE,
)
from stem_service.mdx_onnx import run_vocal_onnx

# CPU speed: same as split.py (AGENT-GUIDE: shifts 0, overlap 0.25, segment for stability)
# Official htdemucs max segment is 7.8s; use 7 (int) to stay under.
# Quality mode uses 3 shifts for better results
# Larger segments for speed mode = faster processing
DEMUCS_SHIFTS = 0
DEMUCS_SHIFTS_QUALITY = 3
DEMUCS_OVERLAP = 0.25
DEMUCS_SEGMENT_SEC_SPEED = 10
DEMUCS_SEGMENT_SEC_QUALITY = 7


def _run_demucs_two_stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
) -> tuple[Path, Path]:
    """
    Run Demucs 2-stem (vocals + no_vocals). Returns (vocals_path, no_vocals_path).
    Both stems are from the same model run, so they are phase-aligned and same length.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if not htdemucs_available():
        raise FileNotFoundError(
            "Demucs model not found: put htdemucs.pth or htdemucs.th in models/. "
            "See README or scripts/copy-models.sh."
        )
    ensure_htdemucs_th()
    shifts = DEMUCS_SHIFTS if prefer_speed else DEMUCS_SHIFTS_QUALITY
    cmd: list[str] = [
        sys.executable,
        "-m",
        "demucs",
        "-n",
        "htdemucs",
        "-o",
        str(output_dir),
        "-d",
        DEMUCS_DEVICE,
        "--shifts",
        str(shifts),
        "--overlap",
        str(DEMUCS_OVERLAP),
        "--segment",
        str(DEMUCS_SEGMENT_SEC_SPEED if prefer_speed else DEMUCS_SEGMENT_SEC_QUALITY),
        "--two-stems",
        "vocals",
    ]
    cmd.extend(["--repo", str(MODELS_DIR)])
    cmd.append(str(input_path))
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
    if result.returncode != 0:
        raise RuntimeError(f"demucs stage1 failed: {result.stderr or result.stdout}")
    track_name = input_path.stem
    base = output_dir / "htdemucs" / track_name
    vocals_path = base / "vocals.wav"
    no_vocals_path = base / "no_vocals.wav"
    if not vocals_path.exists():
        raise RuntimeError(f"demucs did not create {vocals_path}")
    if not no_vocals_path.exists():
        raise RuntimeError(f"demucs did not create {no_vocals_path}")
    return (vocals_path, no_vocals_path)


def extract_vocals_stage1(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
) -> tuple[Path, Path | None]:
    """
    Extract vocals; when possible also return model-native instrumental (no phase inversion).
    Returns (vocals_path, instrumental_path).
    - Demucs path: (vocals.wav, no_vocals.wav) — same model, phase-aligned.
    - ONNX path: (vocals.wav, None) — caller must create instrumental via phase inversion.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if not prefer_speed:
        onnx_vocals = output_dir / "onnx_vocals.wav"
        if (
            run_vocal_onnx(input_path, onnx_vocals, segment_size=256, overlap=2)
            is not None
        ):
            return (onnx_vocals, None)
    vocals_path, no_vocals_path = _run_demucs_two_stem(
        input_path, output_dir, prefer_speed=prefer_speed
    )
    return (vocals_path, no_vocals_path)
