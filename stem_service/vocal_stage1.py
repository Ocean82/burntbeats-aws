"""
Stage 1: Extract vocals and instrumental.

2-stem waterfall (try rank N only if rank N-1 failed):
  0. MDX23C first when ``prefer_speed`` is false and ``model_tier`` is balanced/quality:
     ``quality`` → ``mdx23c_vocal`` ONNX only; instrumental = mix-minus-vocal inside ``mdx_onnx`` (no second ONNX).
     ``balanced`` → vocal + instrumental ONNX when both exist.
  0b. Optional ``USE_AUDIO_SEPARATOR_2STEM``: native Vocals+Instrumental via ``audio-separator`` CLI for the
      same rank-1 vocal ONNX path (after MDX23C block, before ONNX vocal + inversion).
  1. vocal_model_override (benchmark) if valid, else UVR_MDXNET_3_9662 (+ inst ONNX when present, else phase inversion).
  2. UVR_MDXNET_KARA — same inst rule.
  3. MDX23C (quality: vocal + mix-minus-vocal in ``mdx_onnx``; balanced: pair when not already tried as rank 0).
  4. PyTorch Demucs htdemucs --two-stems=vocals.
     → model-native vocals + no_vocals (phase-aligned, no subtraction)

Returns ``(vocals_path, instrumental_path | None, models_used, instrumental_source)``.
``InstrumentalSource.PHASE_INVERSION_PENDING`` means ``instrumental_path`` is ``None`` and the
hybrid caller must run ``phase_inversion``. Any other source implies ``instrumental_path`` is a
final WAV (ONNX inst pass, MDX23C mix-minus inside ``mdx_onnx``, Demucs ``no_vocals``, or
audio-separator). Use ``unpack_stage1_legacy()`` if you only need the first three fields.
"""

from __future__ import annotations

import functools
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
    resolve_models_root_file,
)
from stem_service.audio_separator_2stem import (
    audio_separator_2stem_enabled,
    resolve_audio_separator_exe,
    run_audio_separator_2stem,
)
from stem_service.mdx_onnx import (
    get_available_inst_onnx,
    is_mdx23c_vocal_checkpoint,
    mdx_model_configured,
    resolve_declared_vocal_onnx_path,
    resolve_mdx_model_path,
    resolve_single_vocal_onnx,
    run_inst_onnx,
    run_vocal_onnx,
    vocal_onnx_allowed_for_service,
)

logger = logging.getLogger(__name__)


class InstrumentalSource(Enum):
    """How Stage 1 produced the instrumental (or that hybrid must still phase-invert)."""

    PHASE_INVERSION_PENDING = "phase_inversion_pending"
    ONNX_SEPARATE_INST = "onnx_separate_inst"
    MDX23C_MIX_MINUS = "mdx23c_mix_minus"
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


@functools.lru_cache(maxsize=16)
def _mdx23c_pair_resolve_cached(canonical_declared: str) -> str:
    """Resolve declared mdx23c *.onnx path to an existing weight file; '' if missing."""
    p = Path(canonical_declared)
    if p.suffix.lower() == ".onnx" and p.is_file():
        return str(p.resolve())
    ort = p.with_suffix(".ort")
    if ort.is_file():
        return str(ort.resolve())
    alt = resolve_mdx_model_path(p)
    if alt is not None and alt.is_file():
        return str(alt.resolve())
    return ""


def _resolve_mdx23c_pair_path(declared_onnx: Path) -> Path | None:
    """
    For mdx23c pair, prefer .onnx first and use .ort as fallback.
    This is intentionally different from the global resolver behavior.
    """
    s = _mdx23c_pair_resolve_cached(str(declared_onnx.resolve()))
    return Path(s) if s else None


def _fmt_demucs_subprocess_failure(result: subprocess.CompletedProcess[str]) -> str:
    lim = 8000
    out = (result.stdout or "").strip()
    err = (result.stderr or "").strip()
    if len(out) > lim:
        out = f"...(truncated)\n{out[-lim:]}"
    if len(err) > lim:
        err = f"...(truncated)\n{err[-lim:]}"
    return (
        f"Demucs 2-stem failed (exit {result.returncode}).\n"
        f"STDOUT:\n{out or '(empty)'}\nSTDERR:\n{err or '(empty)'}"
    )


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
        raise RuntimeError(_fmt_demucs_subprocess_failure(result))
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
    # mdx23c_vocal: exactly one ONNX run; instrumental is mix-minus-vocal inside mdx_onnx.
    if is_mdx23c_vocal_checkpoint(vocal_path):
        inst_out = output_dir / f"twostem_rank{rank}_instrumental.wav"
        vocals_path = run_vocal_onnx(
            input_path,
            vocals_out,
            overlap=onnx_overlap,
            job_logger=job_logger,
            model_path_override=vocal_path,
            instrumental_output_path=inst_out,
        )
        if vocals_path is None:
            return None
        if inst_out.is_file():
            log.info(
                "Stage 1 rank %d: mdx23c_vocal + mix-minus-vocal instrumental [overlap=%.0f%%]",
                rank,
                onnx_overlap * 100,
            )
            return (
                vocals_path,
                inst_out,
                [vocal_path.name],
                InstrumentalSource.MDX23C_MIX_MINUS,
            )
        return None
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
    # Quality tier with mdx23c pair can be prohibitively slow on CPU at 75% overlap.
    # Keep model choice the same but use faster overlap for practical latency.
    if model_tier == "quality" and not prefer_speed:
        onnx_overlap = 0.5
    allow_inst_onnx = _should_run_inst_onnx_pass(prefer_speed, model_tier)
    log = job_logger or logger

    # Stabilization path: for balanced/quality on CPU-first deployments,
    # prefer the mdx23c pair when available.
    prefer_mdx23c_pair = (not prefer_speed) and model_tier in ("balanced", "quality")

    # Rank 0: MDX23C first for balanced/quality. Quality = vocal ONNX + mix-minus-vocal in mdx_onnx; balanced = pair.
    if prefer_mdx23c_pair:
        from .config import mdx23c_vocal_available, mdx23c_inst_available

        mdx23c_vocal_path = _resolve_mdx23c_pair_path(
            resolve_models_root_file("mdx23c_vocal.onnx")
        )
        if (
            mdx23c_vocal_available()
            and mdx23c_vocal_path is not None
            and mdx_model_configured(mdx23c_vocal_path)
        ):
            vocals_out = output_dir / "mdx23c_rank0_vocals.wav"
            inst_out = output_dir / "mdx23c_rank0_instrumental.wav"
            vocals_path = run_vocal_onnx(
                input_path,
                vocals_out,
                overlap=onnx_overlap,
                job_logger=job_logger,
                model_path_override=mdx23c_vocal_path,
                instrumental_output_path=inst_out
                if model_tier == "quality"
                else None,
            )
            if vocals_path is None:
                pass
            elif model_tier == "quality":
                if inst_out.is_file():
                    log.info(
                        "Stage 1 rank 0: MDX23C vocal + mix-minus-vocal instrumental for quality [overlap=%.0f%%]",
                        onnx_overlap * 100,
                    )
                    return (
                        vocals_path,
                        inst_out,
                        [mdx23c_vocal_path.name],
                        InstrumentalSource.MDX23C_MIX_MINUS,
                    )
            else:
                mdx23c_inst_path = _resolve_mdx23c_pair_path(
                    resolve_models_root_file("mdx23c_instrumental.onnx")
                )
                if (
                    mdx23c_inst_available()
                    and mdx23c_inst_path is not None
                    and mdx_model_configured(mdx23c_inst_path)
                ):
                    inst_pair_out = output_dir / "mdx23c_rank0_instrumental_onnx.wav"
                    inst_path = run_inst_onnx(
                        input_path,
                        inst_pair_out,
                        overlap=onnx_overlap,
                        job_logger=job_logger,
                        model_path_override=mdx23c_inst_path,
                    )
                    if inst_path is not None:
                        log.info(
                            "Stage 1 rank 0: MDX23C pair preferred for %s [overlap=%.0f%%]",
                            model_tier,
                            onnx_overlap * 100,
                        )
                        return (
                            vocals_path,
                            inst_path,
                            [mdx23c_vocal_path.name, mdx23c_inst_path.name],
                            InstrumentalSource.ONNX_SEPARATE_INST,
                        )

    # Rank 1 vocal path: benchmark override when valid, else UVR_MDXNET_3_9662.
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
            logger.info(
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
            allow_inst_onnx=allow_inst_onnx,
        )
        if got is not None:
            return got

    # Rank 3: MDX23C (skipped at rank 0 when prefer_mdx23c_pair — only reached if rank 0 did not return)
    from .config import mdx23c_vocal_available, mdx23c_inst_available

    mdx23c_vocal_path = _resolve_mdx23c_pair_path(
        resolve_models_root_file("mdx23c_vocal.onnx")
    )
    if (
        mdx23c_vocal_available()
        and mdx23c_vocal_path is not None
        and mdx_model_configured(mdx23c_vocal_path)
    ):
        vocals_out = output_dir / "mdx23c_rank3_vocals.wav"
        inst_out = output_dir / "mdx23c_rank3_instrumental.wav"
        vocals_path = run_vocal_onnx(
            input_path,
            vocals_out,
            overlap=onnx_overlap,
            job_logger=job_logger,
            model_path_override=mdx23c_vocal_path,
            instrumental_output_path=inst_out if model_tier == "quality" else None,
        )
        if vocals_path is not None:
            if model_tier == "quality" and inst_out.is_file():
                log.info(
                    "Stage 1 rank 3: MDX23C vocal + mix-minus-vocal instrumental [overlap=%.0f%%]",
                    onnx_overlap * 100,
                )
                return (
                    vocals_path,
                    inst_out,
                    [mdx23c_vocal_path.name],
                    InstrumentalSource.MDX23C_MIX_MINUS,
                )
            if model_tier != "quality":
                mdx23c_inst_path = _resolve_mdx23c_pair_path(
                    resolve_models_root_file("mdx23c_instrumental.onnx")
                )
                if (
                    mdx23c_inst_available()
                    and mdx23c_inst_path is not None
                    and mdx_model_configured(mdx23c_inst_path)
                ):
                    inst_pair_out = output_dir / "mdx23c_rank3_instrumental_onnx.wav"
                    inst_path = run_inst_onnx(
                        input_path,
                        inst_pair_out,
                        overlap=onnx_overlap,
                        job_logger=job_logger,
                        model_path_override=mdx23c_inst_path,
                    )
                    if inst_path is not None:
                        log.info(
                            "Stage 1 rank 3: MDX23C vocal + instrumental ONNX [overlap=%.0f%%]",
                            onnx_overlap * 100,
                        )
                        return (
                            vocals_path,
                            inst_path,
                            [mdx23c_vocal_path.name, mdx23c_inst_path.name],
                            InstrumentalSource.ONNX_SEPARATE_INST,
                        )

    # Rank 4: PyTorch Demucs htdemucs 2-stem
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
    prefer_speed: bool | None = None, model_tier: str | None = None
) -> tuple[str, list[str]]:
    """
    Preview the first 2-stem rank that would be attempted (on-disk checks only).
    Waterfall: rank0 MDX23C (quality: vocal + mix-minus-vocal; balanced: pair) → rank1 UVR_MDXNET_3_9662 →
    rank2 KARA → rank3 MDX23C → rank4 htdemucs.
    """
    from .config import mdx23c_vocal_available, mdx23c_inst_available

    tier = "fast" if prefer_speed else (model_tier or "balanced")

    if tier in ("balanced", "quality"):
        mdx23c_vocal_path = _resolve_mdx23c_pair_path(
            resolve_models_root_file("mdx23c_vocal.onnx")
        )
        if (
            mdx23c_vocal_available()
            and mdx23c_vocal_path is not None
            and mdx_model_configured(mdx23c_vocal_path)
        ):
            if tier == "quality":
                return ("mdx23c_rank0", [mdx23c_vocal_path.name])
            mdx23c_inst_path = _resolve_mdx23c_pair_path(
                resolve_models_root_file("mdx23c_instrumental.onnx")
            )
            if (
                mdx23c_inst_available()
                and mdx23c_inst_path is not None
                and mdx_model_configured(mdx23c_inst_path)
            ):
                return ("mdx23c_rank0", [mdx23c_vocal_path.name, mdx23c_inst_path.name])

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

    mdx23c_vocal_path = _resolve_mdx23c_pair_path(
        resolve_models_root_file("mdx23c_vocal.onnx")
    )
    if (
        mdx23c_vocal_available()
        and mdx23c_vocal_path is not None
        and mdx_model_configured(mdx23c_vocal_path)
    ):
        if tier == "quality":
            return ("mdx23c", [mdx23c_vocal_path.name])
        mdx23c_inst_path = _resolve_mdx23c_pair_path(
            resolve_models_root_file("mdx23c_instrumental.onnx")
        )
        if (
            mdx23c_inst_available()
            and mdx23c_inst_path is not None
            and mdx_model_configured(mdx23c_inst_path)
        ):
            return ("mdx23c", [mdx23c_vocal_path.name, mdx23c_inst_path.name])

    return ("demucs", ["htdemucs"])
