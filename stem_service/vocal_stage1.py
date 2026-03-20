"""
Stage 1: Extract vocals and instrumental.

Priority order (CPU-only, ONNX-first):
  1. Vocal ONNX (Kim_Vocal_2 / Voc_FT) for vocals
     + Instrumental ONNX (Inst_HQ_4 / Inst_HQ_5) for instrumental
     → best quality, no phase inversion, both from dedicated models
  2. Vocal ONNX for vocals + phase inversion for instrumental
     → good vocals, instrumental via subtraction
  3. Demucs 2-stem (--two-stems vocals)
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
    get_available_vocal_onnx,
    mdx_model_configured,
    run_inst_onnx,
    run_vocal_onnx,
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


def extract_vocals_stage1(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
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

    # 75% overlap for quality, 50% for speed
    onnx_overlap = 0.5 if prefer_speed else 0.75

    # NEW-FLOW.MD RECOMMENDED PRIORITY ORDER FOR CPU-ONLY T3.LARGE:
    # 1. MDX23C vocal ONNX + MDX23C instrumental ONNX (no phase inversion) - PRIMARY CHOICE
    # 2. SCNet 4-stem -> collapse to 2-stem (handled in hybrid.py)
    # 3. Mel-Band RoFormer vocal + phase inversion
    # 4. BS-RoFormer vocal + phase inversion
    # 5. Demucs 2-stem (fallback)

    # Check if we have MDX23C models available and configured (NEW-FLOW PRIMARY CHOICE FOR 2-STEM)
    from .config import mdx23c_vocal_available, mdx23c_inst_available

    mdx23c_vocal_path = MODELS_DIR / "mdx23c_vocal.onnx"
    mdx23c_inst_path = MODELS_DIR / "mdx23c_instrumental.onnx"
    if (
        mdx23c_vocal_available()
        and mdx23c_inst_available()
        and mdx_model_configured(mdx23c_vocal_path)
        and mdx_model_configured(mdx23c_inst_path)
    ):
        # Use MDX23C models directly (NEW-FLOW RECOMMENDATION FOR 2-STEM)
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
                    "Stage 1: MDX23c vocal ONNX + MDX23c instrumental ONNX [overlap=%.0f%%]",
                    onnx_overlap * 100,
                )
                return (
                    vocals_path,
                    inst_path,
                    ["mdx23c_vocal.onnx", "mdx23c_instrumental.onnx"],
                )

    # Fall back to existing vocal model detection
    vocal_model = (
        vocal_model_override
        if vocal_model_override is not None
        else get_available_vocal_onnx()
    )
    inst_model = (
        inst_model_override
        if inst_model_override is not None
        else get_available_inst_onnx()
    )

    if vocal_model is not None and vocal_model.exists():
        vocals_out = output_dir / "onnx_vocals.wav"
        vocals_path = run_vocal_onnx(
            input_path,
            vocals_out,
            overlap=onnx_overlap,
            job_logger=job_logger,
            model_path_override=vocal_model,
        )

        if vocals_path is not None:
            # Try to also get instrumental from dedicated ONNX model
            if inst_model is not None and inst_model.exists():
                inst_out = output_dir / "onnx_instrumental.wav"
                inst_path = run_inst_onnx(
                    input_path,
                    inst_out,
                    overlap=onnx_overlap,
                    job_logger=job_logger,
                    model_path_override=inst_model,
                )
                if inst_path is not None:
                    logger.info(
                        "Stage 1: vocal ONNX (%s) + instrumental ONNX (%s) [overlap=%.0f%%]",
                        vocal_model.name,
                        inst_model.name,
                        onnx_overlap * 100,
                    )
                    return vocals_path, inst_path, [vocal_model.name, inst_model.name]

            # Vocal ONNX succeeded but no instrumental ONNX — caller does phase inversion
            logger.info(
                "Stage 1: vocal ONNX (%s) + phase inversion for instrumental [overlap=%.0f%%]",
                vocal_model.name,
                onnx_overlap * 100,
            )
            return vocals_path, None, [vocal_model.name, "phase_inversion"]

    # No ONNX available — use Demucs 2-stem (model-native, phase-aligned)
    logger.info("Stage 1: Demucs 2-stem (no ONNX available)")
    vocals_path, no_vocals_path = _run_demucs_two_stem(
        input_path, output_dir, prefer_speed=prefer_speed
    )
    return vocals_path, no_vocals_path, ["htdemucs"]


def get_2stem_stage1_preview() -> tuple[str, list[str]]:
    """
    Preview which Stage 1 path and models would be used for 2-stem (no inference).
    Returns (path_kind, model_names) e.g. ("mdx23c", ["mdx23c_vocal.onnx", "mdx23c_instrumental.onnx"])
    or ("onnx", ["Kim_Vocal_2.onnx", "UVR-MDX-NET-Inst_HQ_4.onnx"]) or ("demucs", ["htdemucs"]).
    """
    from .config import mdx23c_vocal_available, mdx23c_inst_available

    mdx23c_vocal_path = MODELS_DIR / "mdx23c_vocal.onnx"
    mdx23c_inst_path = MODELS_DIR / "mdx23c_instrumental.onnx"
    if (
        mdx23c_vocal_available()
        and mdx23c_inst_available()
        and mdx_model_configured(mdx23c_vocal_path)
        and mdx_model_configured(mdx23c_inst_path)
    ):
        return ("mdx23c", ["mdx23c_vocal.onnx", "mdx23c_instrumental.onnx"])

    vocal_model = get_available_vocal_onnx()
    inst_model = get_available_inst_onnx()
    if vocal_model is not None and vocal_model.exists():
        if inst_model is not None and inst_model.exists():
            return ("onnx", [vocal_model.name, inst_model.name])
        return ("onnx", [vocal_model.name, "phase_inversion"])

    return ("demucs", ["htdemucs"])
