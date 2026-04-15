"""
Stem separation using Demucs, CPU-only.

4-stem policy:
- speed: try mapped speed ranks (28 -> 29), then fallback to htdemucs
- quality/balanced: try mapped quality ranks (1 -> 2), then fallback to htdemucs
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
from pathlib import Path

from stem_service.demucs_subprocess import format_demucs_subprocess_failure
from stem_service.config import (
    MODELS_DIR,
    REPO_ROOT,
    USE_DEMUCS_SHIFTS_0,
    DEMUCS_SHIFTS_SPEED,
    DEMUCS_SHIFTS_QUALITY,
    DEMUCS_OVERLAP,
    DEMUCS_SEGMENT_SEC,
    DEMUCS_TIMEOUT_SEC,
    demucs_cli_module,
    demucs_speed_4stem_configs,
    demucs_quality_4stem_configs,
    ensure_htdemucs_th,
    htdemucs_available,
    DEMUCS_DEVICE,
)

logger = logging.getLogger(__name__)

# Demucs output layout: <out_dir>/<model>/<track_name>/{vocals,drums,bass,other}.wav
# With --two-stems=vocals: <out_dir>/htdemucs/<track_name>/{vocals,no_vocals}.wav

_VALID_STEMS = {2, 4}


def _run_demucs_4stem_named_checkpoint(
    input_path: Path,
    output_dir: Path,
    model_name: str,
    repo: Path,
    segment: int,
    output_subdir: str,
) -> list[tuple[str, Path]]:
    """Run demucs -n <model_name> against one mapped checkpoint folder."""
    cmd = _build_demucs_cmd(
        input_path=input_path,
        output_dir=output_dir,
        model_name=model_name,
        shifts=0,
        segment=segment,
        repo=repo,
        two_stems=False,
    )
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        timeout=DEMUCS_TIMEOUT_SEC,
    )
    if result.returncode != 0:
        raise RuntimeError(format_demucs_subprocess_failure(result))
    track_name = input_path.stem
    base = output_dir / output_subdir / track_name
    if not base.exists():
        raise RuntimeError(f"Demucs did not create output under {base}")
    stem_files: list[tuple[str, Path]] = []
    for name in ("vocals", "drums", "bass", "other"):
        wav = base / f"{name}.wav"
        if wav.exists():
            stem_files.append((name, wav))
    return stem_files


def run_demucs(
    input_path: Path,
    output_dir: Path,
    stems: int = 4,
    prefer_speed: bool = True,
) -> list[tuple[str, Path]]:
    """
    Run Demucs separation. Returns list of (stem_id, wav_path).
    stems: 2 -> vocals, instrumental; 4 -> vocals, drums, bass, other.
    2-stem always uses htdemucs.
    4-stem uses mapped rank checkpoints first, then falls back to htdemucs.
    """
    if stems not in _VALID_STEMS:
        raise ValueError(f"stems must be 2 or 4, got {stems}")

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if stems == 4:
        cfgs = (
            demucs_speed_4stem_configs()
            if prefer_speed
            else demucs_quality_4stem_configs()
        )
        lane = "speed" if prefer_speed else "quality"
        last_err: RuntimeError | None = None
        for model_name, repo, segment, output_subdir, _ck in cfgs:
            logger.info(
                "Demucs: 4-stem %s trying %s (segment=%ds, repo=%s)",
                lane,
                model_name,
                segment,
                repo.name,
            )
            try:
                return _run_demucs_4stem_named_checkpoint(
                    input_path,
                    output_dir,
                    model_name,
                    repo,
                    segment,
                    output_subdir,
                )
            except RuntimeError as e:
                last_err = e
                logger.warning(
                    "Demucs: 4-stem %s checkpoint %s failed: %s",
                    lane,
                    model_name,
                    e,
                )
        if last_err is not None:
            logger.info(
                "Demucs: 4-stem %s checkpoints failed; fallback to htdemucs (%s)",
                lane,
                last_err,
            )

    # Single htdemucs (2-stem or 4-stem fallback)
    if not htdemucs_available():
        raise FileNotFoundError(
            "Demucs model not found: put htdemucs.pth or htdemucs.th in models/. "
            "See README or scripts/copy-models.sh."
        )
    ensure_htdemucs_th()
    shifts = (
        0
        if USE_DEMUCS_SHIFTS_0
        else (DEMUCS_SHIFTS_SPEED if prefer_speed else DEMUCS_SHIFTS_QUALITY)
    )
    segment = DEMUCS_SEGMENT_SEC
    logger.info(
        "Demucs: using htdemucs (shifts=%d, segment=%ds, two_stems=%s)",
        shifts,
        segment,
        stems == 2,
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
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        timeout=DEMUCS_TIMEOUT_SEC,
    )
    if result.returncode != 0:
        raise RuntimeError(format_demucs_subprocess_failure(result))
    track_name = input_path.stem
    base = output_dir / "htdemucs" / track_name

    if not base.exists():
        raise RuntimeError(f"Demucs did not create output under {base}")

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
        demucs_cli_module(),
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
