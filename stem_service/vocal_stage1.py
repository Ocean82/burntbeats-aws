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

    vocal_model = vocal_model_override if vocal_model_override is not None else get_available_vocal_onnx()
    inst_model = inst_model_override if inst_model_override is not None else get_available_inst_onnx()

    if vocal_model is not None and vocal_model.exists():
        vocals_out = output_dir / "onnx_vocals.wav"
        vocals_path = run_vocal_onnx(
            input_path, vocals_out, overlap=onnx_overlap, job_logger=job_logger,
            model_path_override=vocal_model,
        )

        if vocals_path is not None:
            # Try to also get instrumental from dedicated ONNX model
            if inst_model is not None and inst_model.exists():
                inst_out = output_dir / "onnx_instrumental.wav"
                inst_path = run_inst_onnx(
                    input_path, inst_out, overlap=onnx_overlap, job_logger=job_logger,
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
