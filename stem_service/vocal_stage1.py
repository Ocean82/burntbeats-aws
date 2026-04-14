"""
Stage 1: Extract vocals and instrumental.

CPU-only 2-stem waterfall (try rank N only if rank N-1 failed):
  1. vocal_model_override (benchmark) if valid, else tier rank-1 vocal ONNX.
     fast/balanced: UVR_MDXNET_3_9662
     quality:       Kim_Vocal_2
  2. tier rank-2 vocal ONNX fallback.
     fast/balanced: UVR_MDXNET_KARA
     quality:       Kim_Vocal_1
  3. Optional ``USE_AUDIO_SEPARATOR_2STEM`` branch (before rank 1 ONNX).
  4. PyTorch Demucs htdemucs --two-stems=vocals (last resort).

MDX23C is intentionally excluded from this 2-stem waterfall.

Instrumental = phase inversion (original − vocals). No second ONNX pass
unless USE_TWO_STEM_INST_ONNX_PASS=1.

Returns ``(vocals_path, instrumental_path | None, models_used, instrumental_source)``.
"""

from __future__ import annotations

import logging
from enum import Enum
import os
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
    demucs_cli_module,
    ensure_htdemucs_th,
    htdemucs_available,
)
from stem_service.demucs_subprocess import format_demucs_subprocess_failure
from stem_service.audio_separator_2stem import (
    audio_separator_2stem_enabled,
    resolve_audio_separator_exe,
    run_audio_separator_2stem,
)
from stem_service.mdx_onnx import (
    get_available_inst_onnx,
    resolve_declared_vocal_onnx_path,
    resolve_single_vocal_onnx,
    run_inst_onnx,
    run_vocal_onnx,
    vocal_onnx_allowed_for_service,
)

logger = logging.getLogger(__name__)


def _vocal_rank_candidates_for_tier(model_tier: str) -> list[str]:
    """Ordered 2-stem vocal candidates by tier contract."""
    if model_tier == "quality":
        return ["Kim_Vocal_2.onnx", "Kim_Vocal_1.onnx"]
    # fast + balanced share speed-first lane.
    return ["UVR_MDXNET_3_9662.onnx", "UVR_MDXNET_KARA.onnx"]


class InstrumentalSource(Enum):
    """How Stage 1 produced the instrumental (or that hybrid must still phase-invert)."""

    PHASE_INVERSION_PENDING = "phase_inversion_pending"
    ONNX_SEPARATE_INST = "onnx_separate_inst"
    DEMUCS_TWO_STEM = "demucs_two_stem"
    AUDIO_SEPARATOR = "audio_separator"

    def needs_hybrid_phase_inversion(self) -> bool:
        return self is InstrumentalSource.PHASE_INVERSION_PENDING


def unpack_stage1_legacy(
    quad: tuple[Path, Path | None, list[str], InstrumentalSource],
) -> tuple[Path, Path | None, list[str]]:
    """Drop ``InstrumentalSource`` for callers that only need paths and ``models_used``."""
    v, i, m, _ = quad
    return v, i, m


def _should_run_inst_onnx_pass(prefer_speed: bool, model_tier: str) -> bool:
    """
    Whether 2-stem stage1 should run the second ONNX instrumental pass.

    Default is disabled because the second pass can add large latency with modest
    quality gain for typical DJ/edit use cases.
    """
    raw = os.environ.get("USE_TWO_STEM_INST_ONNX_PASS", "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    # Default policy: skip second pass for all tiers until explicitly enabled.
    # This keeps 2-stem speed and balanced/quality behavior aligned with
    # product expectations on CPU-first deployments.
    _ = (prefer_speed, model_tier)  # placeholders for future tier-specific logic
    return False


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
        demucs_cli_module(),
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
    # capture_output keeps full streams in memory; trim only when formatting errors
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
    if result.returncode != 0:
        raise RuntimeError(
            f"Demucs 2-stem failed.\n{format_demucs_subprocess_failure(result)}"
        )
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
    allow_inst_onnx: bool,
) -> tuple[Path, Path | None, list[str], InstrumentalSource] | None:
    """Run vocal ONNX; add instrumental ONNX if available, else phase-inversion pending."""
    log = job_logger or logger
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
    if allow_inst_onnx:
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
                log.info(
                    "Stage 1 rank %d: vocal %s + inst %s [overlap=%.0f%%]",
                    rank,
                    vocal_path.name,
                    inst_model.name,
                    onnx_overlap * 100,
                )
                return (
                    vocals_path,
                    inst_path,
                    [vocal_path.name, inst_model.name],
                    InstrumentalSource.ONNX_SEPARATE_INST,
                )
    log.info(
        "Stage 1 rank %d: vocal %s + phase inversion [overlap=%.0f%%]",
        rank,
        vocal_path.name,
        onnx_overlap * 100,
    )
    return (
        vocals_path,
        None,
        [vocal_path.name, "phase_inversion"],
        InstrumentalSource.PHASE_INVERSION_PENDING,
    )


def extract_vocals_stage1(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    model_tier: str = "balanced",
    job_logger: "logging.Logger | None" = None,
    vocal_model_override: Path | None = None,
    inst_model_override: Path | None = None,
) -> tuple[Path, Path | None, list[str], InstrumentalSource]:
    """
    Extract vocals and optionally instrumental.

    prefer_speed=True  → 50% overlap (faster, slightly more boundary artifacts)
    prefer_speed=False → 75% overlap (slower, smoother — recommended for quality)

    Returns (vocals_path, instrumental_path_or_None, models_used, instrumental_source).
    When ``instrumental_source`` is ``PHASE_INVERSION_PENDING``, ``instrumental_path`` is None and
    hybrid must run ``phase_inversion``. Otherwise ``instrumental_path`` is a final stem file.
    models_used: list of model names for metrics (e.g. ["Kim_Vocal_2.onnx", "UVR-MDX-NET-Inst_HQ_5.onnx"]).
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    onnx_overlap = 0.5 if prefer_speed else 0.75
    # Keep quality overlap practical on CPU-first hosts.
    if model_tier == "quality" and not prefer_speed:
        onnx_overlap = 0.5
    allow_inst_onnx = _should_run_inst_onnx_pass(prefer_speed, model_tier)
    log = job_logger or logger

    # Rank 0 intentionally removed.

    rank_candidates = _vocal_rank_candidates_for_tier(model_tier)

    # Rank 1 vocal path: benchmark override when valid, else tier rank-1.
    rank1_vocal: Path | None = None
    if vocal_model_override is not None:
        if vocal_onnx_allowed_for_service(vocal_model_override):
            rank1_vocal = resolve_declared_vocal_onnx_path(vocal_model_override)
        else:
            log.warning(
                "Ignoring vocal_model_override %s (not eligible for stem service)",
                vocal_model_override.name,
            )
    if rank1_vocal is None:
        rank1_vocal = resolve_single_vocal_onnx(rank_candidates[0])

    # Optional: audio-separator CLI — native Vocals + Instrumental (see stem_bench / __model_testing).
    if (
        audio_separator_2stem_enabled()
        and resolve_audio_separator_exe() is not None
        and rank1_vocal is not None
        and rank1_vocal.suffix.lower() in (".onnx", ".ort")
    ):
        sep = run_audio_separator_2stem(input_path, output_dir, rank1_vocal)
        if sep is not None:
            v_wav, i_wav = sep
            log.info(
                "Stage 1: audio-separator 2-stem (%s)",
                rank1_vocal.name,
            )
            return (
                v_wav,
                i_wav,
                ["audio_separator", rank1_vocal.name],
                InstrumentalSource.AUDIO_SEPARATOR,
            )

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
            allow_inst_onnx=allow_inst_onnx,
        )
        if got is not None:
            return got

    # Rank 2: tier-specific fallback
    rank2_vocal = (
        resolve_single_vocal_onnx(rank_candidates[1])
        if len(rank_candidates) > 1
        else None
    )
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
            allow_inst_onnx=allow_inst_onnx,
        )
        if got is not None:
            return got

    # Final fallback: PyTorch Demucs htdemucs 2-stem
    log.info("Stage 1 rank 4: Demucs 2-stem (htdemucs)")
    vocals_path, no_vocals_path = _run_demucs_two_stem(
        input_path, output_dir, prefer_speed=prefer_speed
    )
    return (
        vocals_path,
        no_vocals_path,
        ["htdemucs"],
        InstrumentalSource.DEMUCS_TWO_STEM,
    )


def get_2stem_stage1_preview(
    prefer_speed: bool | None = None,
    model_tier: str | None = None,
    stem_backend: str | None = None,
) -> tuple[str, list[str]]:
    """
    Preview the first 2-stem rank that would be attempted (on-disk checks only).
    Waterfall: rank1 → rank2 (tier-specific) → htdemucs. MDX23C not in waterfall.
    """
    if stem_backend == "demucs_only":
        return ("demucs", ["htdemucs"])

    tier = "fast" if prefer_speed else (model_tier or "balanced")
    allow_inst_onnx = _should_run_inst_onnx_pass(bool(prefer_speed), tier)
    rank_candidates = _vocal_rank_candidates_for_tier(tier)

    v1 = resolve_single_vocal_onnx(rank_candidates[0])
    if v1 is not None:
        inst = get_available_inst_onnx(tier=tier) if allow_inst_onnx else None
        if inst is not None:
            return ("onnx_rank1", [v1.name, inst.name])
        return ("onnx_rank1", [v1.name, "phase_inversion"])

    v2 = (
        resolve_single_vocal_onnx(rank_candidates[1])
        if len(rank_candidates) > 1
        else None
    )
    if v2 is not None:
        inst = get_available_inst_onnx(tier=tier) if allow_inst_onnx else None
        if inst is not None:
            return ("onnx_rank2", [v2.name, inst.name])
        return ("onnx_rank2", [v2.name, "phase_inversion"])

    return ("demucs", ["htdemucs"])
