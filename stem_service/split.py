"""
Stem separation using Demucs (htdemucs or YAML-defined bags in Demucs_Models), CPU-only.
Demucs CLI defaults: --shifts 0 (speed), --overlap 0.25, --segment from yaml or config.
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
    demucs_extra_available,
    demucs_quality_4stem_configs,
    demucs_quality_yaml_bags_allowed,
    demucs_speed_4stem_configs,
    ensure_htdemucs_th,
    get_demucs_quality_bag_config,
    htdemucs_available,
    DEMUCS_DEVICE,
)

logger = logging.getLogger(__name__)

# Demucs output layout: <out_dir>/<model_or_subdir>/<track_name>/{vocals,drums,bass,other}.wav
# With --two-stems=vocals: <out_dir>/htdemucs/<track_name>/{vocals,no_vocals}.wav

_VALID_STEMS = {2, 4}


def _run_demucs_4stem_named_bag(
    input_path: Path,
    output_dir: Path,
    model_name: str,
    repo: Path,
    segment: int,
    output_subdir: str,
) -> list[tuple[str, Path]]:
    """Run demucs -n <model_name> with repo/segment; return stem paths (4-stem only)."""
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
        raise RuntimeError(
            f"Demucs bag ({model_name}) failed.\n{format_demucs_subprocess_failure(result)}"
        )
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
    prefer_speed=True, stems=4: single-checkpoint speed repos (rank 27 → 28) when present, else htdemucs.
    prefer_speed=False, stems=4: single-checkpoint quality repos (rank1 → rank2), then optional YAML bags
    if ``DEMUCS_QUALITY_BAG`` is not ``single``, else htdemucs with shifts per config.
    """
    if stems not in _VALID_STEMS:
        raise ValueError(f"stems must be 2 or 4, got {stems}")

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Determine which model to use
    use_quality_bag = (
        not prefer_speed
        and stems == 4
        and demucs_quality_yaml_bags_allowed()
        and demucs_extra_available()
    )

    if stems == 4 and prefer_speed:
        speed_cfgs = demucs_speed_4stem_configs()
        last_err: RuntimeError | None = None
        for model_name, repo, segment, output_subdir, _ck in speed_cfgs:
            logger.info(
                "Demucs: 4-stem speed trying %s (segment=%ds, repo=%s)",
                model_name,
                segment,
                repo.name,
            )
            try:
                return _run_demucs_4stem_named_bag(
                    input_path,
                    output_dir,
                    model_name,
                    repo,
                    segment,
                    output_subdir,
                )
            except RuntimeError as e:
                last_err = e
                logger.warning("Demucs: speed bag %s failed: %s", model_name, e)
        if last_err is not None:
            logger.info(
                "Demucs: all speed single checkpoints failed, falling back to htdemucs (%s)",
                last_err,
            )

    if stems == 4 and not prefer_speed:
        q_cfgs = demucs_quality_4stem_configs()
        last_q: RuntimeError | None = None
        for model_name, repo, segment, output_subdir, _ck in q_cfgs:
            logger.info(
                "Demucs: 4-stem quality single trying %s (segment=%ds, repo=%s)",
                model_name,
                segment,
                repo.name,
            )
            try:
                return _run_demucs_4stem_named_bag(
                    input_path,
                    output_dir,
                    model_name,
                    repo,
                    segment,
                    output_subdir,
                )
            except RuntimeError as e:
                last_q = e
                logger.warning("Demucs: quality single %s failed: %s", model_name, e)
        if last_q is not None:
            logger.info(
                "Demucs: all quality single checkpoints failed (%s); yaml bag or htdemucs next",
                last_q,
            )

    if use_quality_bag:
        model_name, repo, segment, output_subdir = get_demucs_quality_bag_config()
        logger.info(
            "Demucs: using %s bag (segment=%ds, repo=%s)",
            model_name,
            segment,
            repo.name,
        )
        return _run_demucs_4stem_named_bag(
            input_path,
            output_dir,
            model_name,
            repo,
            segment,
            output_subdir,
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
