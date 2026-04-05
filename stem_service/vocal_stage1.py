"""
Stage 1: Extract vocals and instrumental.

2-stem waterfall (try rank N only if rank N-1 failed):
  1. vocal_model_override (benchmark) if valid, else UVR_MDXNET_3_9662 (+ inst ONNX when present, else phase inversion).
  2. UVR_MDXNET_KARA — same inst rule.
  3. MDX23C vocal + MDX23C instrumental (both must succeed).
  4. PyTorch Demucs htdemucs --two-stems=vocals.
     → model-native vocals + no_vocals (phase-aligned, no subtraction)

Returns (vocals_path, instrumental_path | None).
When instrumental_path is None, caller must create it via phase inversion.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

from stem_service.config import (
    DEMUCS_DEVICE,
    DEMUCS_OVERLAP,
    DEMUCS_SEGMENT_SEC,
    DEMUCS_SHIFTS_QUALITY,
    MODELS_DIR,
    REPO_ROOT,
    USE_DEMUCS_SHIFTS_0,
    ensure_htdemucs_th,
    htdemucs_available,
)
from stem_service.mdx_onnx import (
    get_available_inst_onnx,
    mdx_model_configured,
    resolve_declared_vocal_onnx_path,
    resolve_mdx_model_path,
    resolve_single_vocal_onnx,
    run_inst_onnx,
    run_vocal_onnx,
    vocal_onnx_allowed_for_service,
)
logger = logging.getLogger(__name__)


def _run_demucs_two_stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
) -> tuple[Path, Path]:
    """
    Run Demucs --two-stems=vocals. Returns (vocals_path, no_vocals_path).
    Both stems are model-native and phase-aligned — no subtraction needed.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    if not htdemucs_available():
        raise FileNotFoundError(
            "Demucs model not found. Place htdemucs.pth or htdemucs.th in models/."
        )
    ensure_htdemucs_th()
    shifts = 0 if (USE_DEMUCS_SHIFTS_0 or prefer_speed) else DEMUCS_SHIFTS_QUALITY
    cmd = [
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
        str(DEMUCS_SEGMENT_SEC),
        "--two-stems",
        "vocals",
        "--repo",
        str(MODELS_DIR),
        str(input_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
    if result.returncode != 0:
        raise RuntimeError(f"Demucs 2-stem failed: {result.stderr or result.stdout}")
    base = output_dir / "htdemucs" / input_path.stem
    vocals = base / "vocals.wav"
    no_vocals = base / "no_vocals.wav"
    if not vocals.exists():
        raise RuntimeError(f"Demucs did not produce {vocals}")
    if not no_vocals.exists():
        raise RuntimeError(f"Demucs did not produce {no_vocals}")
    return vocals, no_vocals


def _pair_vocal_with_inst_onnx(
    input_path: Path,
    output_dir: Path,
    onnx_overlap: float,
    vocal_path: Path,
    rank: int,
    model_tier: str,
    inst_model_override: Path | None,
    job_logger: "logging.Logger | None",
) -> tuple[Path, Path | None, list[str]] | None:
    """Run vocal ONNX; add instrumental ONNX if available, else leave phase inversion to caller."""
    vocals_out = output_dir / f"twostem_rank{rank}_vocals.wav"
    vocals_path = run_vocal_onnx(
        input_path,
        vocals_out,
        overlap=onnx_overlap,
        job_logger=job_logger,
        model_path_override=vocal_path,
    )
    if vocals_path is None:
        return None
    inst_model = (
        inst_model_override
        if inst_model_override is not None
        else get_available_inst_onnx(tier=model_tier)
    )
    if inst_model is not None:
        inst_out = output_dir / f"twostem_rank{rank}_instrumental.wav"
        inst_path = run_inst_onnx(
            input_path,
            inst_out,
            overlap=onnx_overlap,
            job_logger=job_logger,
            model_path_override=inst_model,
        )
        if inst_path is not None:
            logger.info(
                "Stage 1 rank %d: vocal %s + inst %s [overlap=%.0f%%]",
                rank,
                vocal_path.name,
                inst_model.name,
                onnx_overlap * 100,
            )
            return vocals_path, inst_path, [vocal_path.name, inst_model.name]
    logger.info(
        "Stage 1 rank %d: vocal %s + phase inversion [overlap=%.0f%%]",
        rank,
        vocal_path.name,
        onnx_overlap * 100,
    )
    return vocals_path, None, [vocal_path.name, "phase_inversion"]


def extract_vocals_stage1(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    model_tier: str = "balanced",
    job_logger: "logging.Logger | None" = None,
    vocal_model_override: Path | None = None,
    inst_model_override: Path | None = None,
) -> tuple[Path, Path | None, list[str]]:
    """
    Extract vocals and optionally instrumental.

    prefer_speed=True  → 50% overlap (faster, slightly more boundary artifacts)
    prefer_speed=False → 75% overlap (slower, smoother — recommended for quality)

    Returns (vocals_path, instrumental_path_or_None, models_used).
    When instrumental_path is None, caller must create it via phase inversion.
    models_used: list of model names for metrics (e.g. ["Kim_Vocal_2.onnx", "UVR-MDX-NET-Inst_HQ_5.onnx"]).
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    onnx_overlap = 0.5 if prefer_speed else 0.75

    # Rank 1: benchmark override when valid, else UVR_MDXNET_3_9662 (see ranked_practical_time_score.csv).
    rank1_vocal: Path | None = None
    if vocal_model_override is not None:
        if vocal_onnx_allowed_for_service(vocal_model_override):
            rank1_vocal = resolve_declared_vocal_onnx_path(vocal_model_override)
        else:
            logger.warning(
                "Ignoring vocal_model_override %s (not eligible for stem service)",
                vocal_model_override.name,
            )
    if rank1_vocal is None:
        rank1_vocal = resolve_single_vocal_onnx("UVR_MDXNET_3_9662.onnx")
    if rank1_vocal is not None:
        got = _pair_vocal_with_inst_onnx(
            input_path,
            output_dir,
            onnx_overlap,
            rank1_vocal,
            rank=1,
            model_tier=model_tier,
            inst_model_override=inst_model_override,
            job_logger=job_logger,
        )
        if got is not None:
            return got

    # Rank 2: UVR_MDXNET_KARA
    rank2_vocal = resolve_single_vocal_onnx("UVR_MDXNET_KARA.onnx")
    if rank2_vocal is not None:
        got = _pair_vocal_with_inst_onnx(
            input_path,
            output_dir,
            onnx_overlap,
            rank2_vocal,
            rank=2,
            model_tier=model_tier,
            inst_model_override=inst_model_override,
            job_logger=job_logger,
        )
        if got is not None:
            return got

    # Rank 3: MDX23C pair (both stems must succeed)
    from .config import mdx23c_vocal_available, mdx23c_inst_available

    mdx23c_vocal_path = resolve_mdx_model_path(MODELS_DIR / "mdx23c_vocal.onnx")
    mdx23c_inst_path = resolve_mdx_model_path(MODELS_DIR / "mdx23c_instrumental.onnx")
    if (
        mdx23c_vocal_available()
        and mdx23c_inst_available()
        and mdx23c_vocal_path is not None
        and mdx23c_inst_path is not None
        and mdx_model_configured(mdx23c_vocal_path)
        and mdx_model_configured(mdx23c_inst_path)
    ):
        vocals_out = output_dir / "mdx23c_vocals.wav"
        vocals_path = run_vocal_onnx(
            input_path,
            vocals_out,
            overlap=onnx_overlap,
            job_logger=job_logger,
            model_path_override=mdx23c_vocal_path,
        )
        if vocals_path is not None:
            inst_out = output_dir / "mdx23c_instrumental.wav"
            inst_path = run_inst_onnx(
                input_path,
                inst_out,
                overlap=onnx_overlap,
                job_logger=job_logger,
                model_path_override=mdx23c_inst_path,
            )
            if inst_path is not None:
                logger.info(
                    "Stage 1 rank 3: MDX23C vocal + instrumental ONNX [overlap=%.0f%%]",
                    onnx_overlap * 100,
                )
                return (
                    vocals_path,
                    inst_path,
                    [mdx23c_vocal_path.name, mdx23c_inst_path.name],
                )

    # Rank 4: PyTorch Demucs htdemucs 2-stem
    logger.info("Stage 1 rank 4: Demucs 2-stem (htdemucs)")
    vocals_path, no_vocals_path = _run_demucs_two_stem(
        input_path, output_dir, prefer_speed=prefer_speed
    )
    return vocals_path, no_vocals_path, ["htdemucs"]


def get_2stem_stage1_preview(
    prefer_speed: bool | None = None, model_tier: str | None = None
) -> tuple[str, list[str]]:
    """
    Preview the first 2-stem rank that would be attempted (on-disk checks only).
    Waterfall: rank1 UVR_MDXNET_3_9662 → rank2 KARA → rank3 MDX23C pair → rank4 htdemucs.
    """
    from .config import mdx23c_vocal_available, mdx23c_inst_available

    tier = "fast" if prefer_speed else (model_tier or "balanced")

    v1 = resolve_single_vocal_onnx("UVR_MDXNET_3_9662.onnx")
    if v1 is not None:
        inst = get_available_inst_onnx(tier=tier)
        if inst is not None:
            return ("onnx_rank1", [v1.name, inst.name])
        return ("onnx_rank1", [v1.name, "phase_inversion"])

    v2 = resolve_single_vocal_onnx("UVR_MDXNET_KARA.onnx")
    if v2 is not None:
        inst = get_available_inst_onnx(tier=tier)
        if inst is not None:
            return ("onnx_rank2", [v2.name, inst.name])
        return ("onnx_rank2", [v2.name, "phase_inversion"])

    mdx23c_vocal_path = resolve_mdx_model_path(MODELS_DIR / "mdx23c_vocal.onnx")
    mdx23c_inst_path = resolve_mdx_model_path(MODELS_DIR / "mdx23c_instrumental.onnx")
    if (
        mdx23c_vocal_available()
        and mdx23c_inst_available()
        and mdx23c_vocal_path is not None
        and mdx23c_inst_path is not None
        and mdx_model_configured(mdx23c_vocal_path)
        and mdx_model_configured(mdx23c_inst_path)
    ):
        return ("mdx23c", [mdx23c_vocal_path.name, mdx23c_inst_path.name])

    return ("demucs", ["htdemucs"])
