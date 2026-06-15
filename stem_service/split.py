"""
Stem separation using Demucs, CPU-only.

4-stem policy:
- speed: one mapped speed checkpoint
- quality: one mapped quality checkpoint

There is no runtime fallback from a mapped 4-stem checkpoint to htdemucs.
"""

from __future__ import annotations

import logging
import shutil
import sys
from pathlib import Path
from typing import Callable

from stem_service.subprocess_safe import (
    resolve_subprocess_path,
    validate_model_name,
)
from stem_service.demucs_subprocess import format_demucs_subprocess_failure
from stem_service.demucs_process import (
    DemucsHealthMarker,
    DemucsProcessCancelledError,
    DemucsProcessTimeoutError,
    run_supervised_subprocess,
)
from stem_service.config import (
    MODELS_DIR,
    REPO_ROOT,
    USE_DEMUCS_SHIFTS_0,
    DEMUCS_SHIFTS_SPEED,
    DEMUCS_SHIFTS_QUALITY,
    DEMUCS_OVERLAP,
    DEMUCS_SEGMENT_SEC,
    DEMUCS_TIMEOUT_HARD_SEC,
    DEMUCS_TIMEOUT_ACTIVITY_SEC,
    DEMUCS_TIMEOUT_STARTUP_GRACE_SEC,
    demucs_cli_module,
    demucs_speed_4stem_configs,
    demucs_quality_4stem_configs,
    ensure_htdemucs_th,
    htdemucs_available,
    DEMUCS_DEVICE,
    DEMUCS_EXECUTION_MODE,
)
from stem_service.demucs_rpc import choose_route, run_demucs_via_rpc

logger = logging.getLogger(__name__)

# Demucs output layout: <out_dir>/<model>/<track_name>/{vocals,drums,bass,other}.wav
# With --two-stems=vocals: <out_dir>/htdemucs/<track_name>/{vocals,no_vocals}.wav

_VALID_STEMS = {2, 4}
_LAST_EXECUTION_ROUTE = "legacy"


def get_last_execution_route() -> str:
    return _LAST_EXECUTION_ROUTE


def _set_last_execution_route(route: str) -> None:
    global _LAST_EXECUTION_ROUTE
    _LAST_EXECUTION_ROUTE = route


def _run_demucs_4stem_named_checkpoint(
    input_path: Path,
    output_dir: Path,
    model_name: str,
    repo: Path,
    segment: int,
    output_subdir: str,
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[DemucsHealthMarker], None] | None = None,
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
    try:
        result = run_supervised_subprocess(
            cmd=cmd,
            cwd=REPO_ROOT,
            hard_timeout_seconds=DEMUCS_TIMEOUT_HARD_SEC,
            activity_timeout_seconds=DEMUCS_TIMEOUT_ACTIVITY_SEC,
            startup_grace_seconds=DEMUCS_TIMEOUT_STARTUP_GRACE_SEC,
            cancel_check=cancel_check,
            health_callback=health_callback,
        )
    except DemucsProcessCancelledError as exc:
        raise RuntimeError(str(exc)) from exc
    except DemucsProcessTimeoutError as exc:
        raise RuntimeError(str(exc)) from exc
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


def run_demucs_legacy(
    input_path: Path,
    output_dir: Path,
    stems: int = 4,
    prefer_speed: bool = False,
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[DemucsHealthMarker], None] | None = None,
) -> list[tuple[str, Path]]:
    """
    Run Demucs separation. Returns list of (stem_id, wav_path).
    stems: 2 -> vocals, instrumental; 4 -> vocals, drums, bass, other.
    2-stem always uses htdemucs.
    4-stem uses one deterministic mapped checkpoint per tier.
    """
    if stems not in _VALID_STEMS:
        raise ValueError(f"stems must be 2 or 4, got {stems}")

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if stems == 4:
        cfgs = demucs_speed_4stem_configs()
        lane = "speed"
        if not cfgs:
            raise FileNotFoundError(
                f"Demucs 4-stem {lane} checkpoint not found in configured models directory."
            )
        model_name, repo, segment, output_subdir, _ck = cfgs[0]
        logger.info(
            "Demucs: 4-stem %s using %s (segment=%ds, repo=%s)",
            lane,
            model_name,
            segment,
            repo.name,
        )
        return _run_demucs_4stem_named_checkpoint(
            input_path,
            output_dir,
            model_name,
            repo,
            segment,
            output_subdir,
            cancel_check=cancel_check,
            health_callback=health_callback,
        )

    # Single htdemucs (2-stem only)
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
    try:
        result = run_supervised_subprocess(
            cmd=cmd,
            cwd=REPO_ROOT,
            hard_timeout_seconds=DEMUCS_TIMEOUT_HARD_SEC,
            activity_timeout_seconds=DEMUCS_TIMEOUT_ACTIVITY_SEC,
            startup_grace_seconds=DEMUCS_TIMEOUT_STARTUP_GRACE_SEC,
            cancel_check=cancel_check,
            health_callback=health_callback,
        )
    except DemucsProcessCancelledError as exc:
        raise RuntimeError(str(exc)) from exc
    except DemucsProcessTimeoutError as exc:
        raise RuntimeError(str(exc)) from exc
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


def run_demucs(
    input_path: Path,
    output_dir: Path,
    stems: int = 4,
    prefer_speed: bool = False,
    cancel_check: Callable[[], bool] | None = None,
    health_callback: Callable[[DemucsHealthMarker], None] | None = None,
    job_id: str | None = None,
) -> list[tuple[str, Path]]:
    """Execute Demucs via selected execution mode with safe fallback behavior."""
    resolved_job_id = job_id or f"{input_path.name}:{stems}:{'speed' if prefer_speed else 'quality'}"
    decision = choose_route(
        execution_mode=DEMUCS_EXECUTION_MODE,
        prefer_speed=prefer_speed,
        job_id=resolved_job_id,
    )

    if decision.route == "legacy":
        _set_last_execution_route("legacy")
        return run_demucs_legacy(
            input_path=input_path,
            output_dir=output_dir,
            stems=stems,
            prefer_speed=prefer_speed,
            cancel_check=cancel_check,
            health_callback=health_callback,
        )

    request = {
        "job_id": resolved_job_id,
        "input_path": str(input_path),
        "output_dir": str(output_dir),
        "stems": stems,
        "prefer_speed": prefer_speed,
    }
    try:
        response = run_demucs_via_rpc(request)
        if response.get("status") != "completed":
            raise RuntimeError(response.get("error", "RPC Demucs failed"))
        _set_last_execution_route("rpc")
        return [(stem_id, Path(path)) for stem_id, path in response.get("stems", [])]
    except Exception as exc:
        if not decision.fallback_on_error:
            raise
        logger.warning("Demucs RPC failed; falling back to legacy subprocess: %s", exc)
        _set_last_execution_route("rpc_fallback_legacy")
        return run_demucs_legacy(
            input_path=input_path,
            output_dir=output_dir,
            stems=stems,
            prefer_speed=prefer_speed,
            cancel_check=cancel_check,
            health_callback=health_callback,
        )


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
    safe_model = validate_model_name(model_name)
    cmd: list[str] = [
        sys.executable,
        "-m",
        demucs_cli_module(),
        "-n",
        safe_model,
        "-o",
        resolve_subprocess_path(output_dir),
        "-d",
        DEMUCS_DEVICE,
        "--shifts",
        str(shifts),
        "--overlap",
        str(DEMUCS_OVERLAP),
        "--segment",
        str(segment),
    ]
    cmd.extend(["--repo", resolve_subprocess_path(repo)])
    if two_stems:
        cmd.extend(["--two-stems", "vocals"])
    cmd.append(resolve_subprocess_path(input_path))
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
