"""
Hybrid pipeline — see docs/stem-pipeline.md: Stage 1 vocals → phase inversion → Stage 2 Demucs on instrumental.
Optional: Silero VAD pre-trim (USE_VAD_PRETRIM=1) to process only vocal span for speed.
Output: vocals, drums, bass, other (4 stems). Optional 2-stem: vocals + instrumental only.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from pathlib import Path
from typing import Callable

import numpy as np
import soundfile as sf

from stem_service.config import (
    USE_VAD_CHUNKS,
    USE_VAD_PRETRIM,
    VAD_CHUNK_LENGTH_S,
    VAD_CHUNK_SILENCE_FLUSH_S,
    four_stem_skip_scnet,
    get_scnet_onnx_path,
    scnet_available,
    scnet_torch_available,
)
from stem_service.phase_inversion import create_perfect_instrumental
from stem_service.scnet_onnx import (
    run_scnet_onnx_4stem,
    scnet_onnx_disable_reason,
    scnet_onnx_runtime_available,
)
from stem_service.scnet_torch import run_scnet_torch_4stem
from stem_service.split import run_demucs
from stem_service.vad import (
    get_chunk_boundaries,
    is_vad_available,
    trim_audio_to_speech_span,
)
from stem_service.vocal_stage1 import InstrumentalSource, extract_vocals_stage1

logger = logging.getLogger(__name__)


def _materialize_stage1_instrumental(
    effective_input: Path,
    vocals_path: Path,
    stage1_instrumental: Path | None,
    inst_src: InstrumentalSource,
    dest_instrumental: Path,
) -> None:
    """
    Copy Stage-1 instrumental when already final, or run phase inversion when pending.
    Enforces invariants so ``None`` is never ambiguous.
    """
    if inst_src.needs_hybrid_phase_inversion():
        if stage1_instrumental is not None:
            raise ValueError(
                "Stage 1 invariant: PHASE_INVERSION_PENDING but instrumental path is set"
            )
        create_perfect_instrumental(effective_input, vocals_path, dest_instrumental)
        return
    if stage1_instrumental is None:
        raise ValueError(
            f"Stage 1 invariant: instrumental_source={inst_src.value!r} requires a path"
        )
    shutil.copy2(stage1_instrumental, dest_instrumental)


def collapse_4stem_to_2stem(
    four_stem_list: list[tuple[str, Path]], output_dir: Path
) -> list[tuple[str, Path]]:
    """
    Convert 4-stem separation (vocals, drums, bass, other) to 2-stem
    (vocals, instrumental) by summing non-vocal stems.

    Args:
        four_stem_list: List of (stem_id, Path) tuples from 4-stem separation
        output_dir: Directory to save the collapsed instrumental

    Returns:
        List of (stem_id, Path) tuples for 2-stem: [("vocals", path), ("instrumental", path)]
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Extract vocals and non-vocal stems
    vocals_path = None
    stem_arrays = []
    sample_rate = None

    for stem_id, stem_path in four_stem_list:
        if stem_id == "vocals":
            vocals_path = stem_path
        elif stem_id in ["drums", "bass", "other"]:
            # Read audio data for summing
            audio, sr = sf.read(str(stem_path), dtype="float32", always_2d=True)
            if stem_arrays:  # Not first stem
                if len(audio) != len(stem_arrays[0]) or sr != sample_rate:
                    raise ValueError(
                        f"Stem {stem_id} has mismatched dimensions or sample rate"
                    )
            stem_arrays.append(audio)
            sample_rate = sr

    if vocals_path is None:
        raise ValueError("Vocals stem not found in 4-stem output")

    if not stem_arrays:
        raise ValueError("No non-vocal stems found to create instrumental")

    # Sum all non-vocal stems to create instrumental
    instrumental_audio = np.sum(stem_arrays, axis=0)

    # Save instrumental
    instrumental_path = output_dir / "instrumental.wav"
    sf.write(str(instrumental_path), instrumental_audio, sample_rate)

    # Return 2-stem result: vocals + instrumental
    return [("vocals", vocals_path), ("instrumental", instrumental_path)]


def _effective_input_path(
    input_path: Path,
    output_dir: Path,
    use_vad_trim: bool | None = None,
) -> Path:
    """If VAD trim requested and VAD available, trim to speech span; else return input.
    use_vad_trim: True = trim when VAD available; False = never trim; None = follow USE_VAD_PRETRIM env.
    """
    if not USE_VAD_PRETRIM:
        return input_path
    if use_vad_trim is False:
        return input_path
    if not is_vad_available():
        return input_path
    trimmed = output_dir / "vad_trimmed.wav"
    if trim_audio_to_speech_span(input_path, trimmed) is not None:
        return trimmed
    return input_path


def _slice_audio(
    input_path: Path,
    start_s: float,
    end_s: float,
    out_path: Path,
) -> Path:
    """Write a slice of input_path [start_s, end_s) to out_path."""
    audio, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    start_i = int(start_s * sr)
    end_i = min(int(end_s * sr), len(audio))
    sf.write(str(out_path), audio[start_i:end_i], sr)
    return out_path


def _concat_stems(
    chunk_stem_lists: list[list[tuple[str, Path]]],
    output_dir: Path,
) -> list[tuple[str, Path]]:
    """Concatenate per-chunk stem WAVs into final stems."""
    if not chunk_stem_lists:
        return []
    stem_ids = [sid for sid, _ in chunk_stem_lists[0]]
    result: list[tuple[str, Path]] = []
    for stem_id in stem_ids:
        chunks_for_stem: list[np.ndarray] = []
        sr_out = 44100
        for chunk_stems in chunk_stem_lists:
            for sid, path in chunk_stems:
                if sid == stem_id:
                    audio, sr_out = sf.read(str(path), dtype="float32", always_2d=True)
                    chunks_for_stem.append(audio)
                    break
        if not chunks_for_stem:
            continue
        combined = np.concatenate(chunks_for_stem, axis=0)
        out_path = output_dir / f"{stem_id}.wav"
        sf.write(str(out_path), combined, sr_out)
        result.append((stem_id, out_path))
    return result


def _run_chunked_4stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
) -> tuple[list[tuple[str, Path]], list[str]] | None:
    """
    VAD-chunked 4-stem separation (Option B from VADSLICE doc).
    Slices input at silence boundaries, runs separation per chunk,
    then concatenates stems. Returns None if VAD unavailable or
    only one chunk found (caller falls back to full-file processing).
    Returns (stem_list, models_used) with models from first chunk.
    """
    import logging as _log

    logger = _log.getLogger(__name__)

    if not is_vad_available():
        return None

    boundaries = get_chunk_boundaries(
        input_path,
        chunk_length_s=float(VAD_CHUNK_LENGTH_S),
        silence_flush_s=VAD_CHUNK_SILENCE_FLUSH_S,
    )
    if boundaries is None or len(boundaries) <= 1:
        return None

    logger.info("VAD chunking: %d chunks for %s", len(boundaries), input_path.name)

    chunk_stem_lists: list[list[tuple[str, Path]]] = []
    first_chunk_models: list[str] = []
    chunks_dir = output_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    for i, (start_s, end_s) in enumerate(boundaries):
        if progress_callback:
            progress_callback(int(10 + (i / len(boundaries)) * 80))

        chunk_path = chunks_dir / f"chunk_{i:03d}.wav"
        _slice_audio(input_path, start_s, end_s, chunk_path)

        chunk_out = chunks_dir / f"chunk_{i:03d}_stems"
        chunk_out.mkdir(parents=True, exist_ok=True)

        stems, chunk_models = run_hybrid_4stem(
            chunk_path,
            chunk_out,
            prefer_speed=prefer_speed,
            progress_callback=None,
            job_logger=job_logger,
        )
        if not first_chunk_models:
            first_chunk_models = chunk_models
        chunk_stem_lists.append(stems)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    result = _concat_stems(chunk_stem_lists, flat_dir)

    if progress_callback:
        progress_callback(100)
    return result, first_chunk_models if first_chunk_models else ["chunked_4stem"]


def run_4stem_single_pass_or_hybrid(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
    model_tier: str = "balanced",
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Entry point for 4-stem separation.
    - If USE_VAD_CHUNKS=1 and VAD available: slice at silence boundaries,
      run separation per chunk, concatenate (Option B from VADSLICE doc).
    - Otherwise: PyTorch htdemucs by default (FOUR_STEM_BACKEND=hybrid). With FOUR_STEM_BACKEND=auto, try SCNet ONNX first, then hybrid.
    Returns [(stem_id, path), ...] in order: vocals, drums, bass, other.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    _log = job_logger or logger

    # VAD chunked path
    if USE_VAD_CHUNKS:
        chunked = _run_chunked_4stem(
            input_path,
            output_dir,
            prefer_speed=prefer_speed,
            progress_callback=progress_callback,
            job_logger=job_logger,
        )
        if chunked is not None:
            stem_list, models_used = chunked
            return stem_list, models_used

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)

    # 4-stem: default skips SCNet (FOUR_STEM_BACKEND=hybrid). auto tries PyTorch SCNet repo, then ONNX, then Demucs.
    if not four_stem_skip_scnet() and scnet_available():
        if scnet_torch_available():
            if progress_callback:
                progress_callback(5)
            _log.info("4-stem: trying SCNet PyTorch (starrytong/SCNet)")
            scnet_list = run_scnet_torch_4stem(
                input_path, flat_dir, prefer_speed=prefer_speed
            )
            if scnet_list is not None:
                if progress_callback:
                    progress_callback(100)
                _log.info("4-stem: SCNet PyTorch succeeded  models_used=[scnet_torch]")
                return scnet_list, ["scnet_torch"]
            _log.warning(
                "4-stem: SCNet PyTorch failed or returned None; trying ONNX or Demucs"
            )

        onnx_path = get_scnet_onnx_path()
        if onnx_path is not None and scnet_onnx_runtime_available():
            if progress_callback:
                progress_callback(5)
            _log.info("4-stem: trying SCNet ONNX")
            scnet_list = run_scnet_onnx_4stem(
                input_path, flat_dir, prefer_speed=prefer_speed
            )
            if scnet_list is not None:
                if progress_callback:
                    progress_callback(100)
                _log.info("4-stem: SCNet ONNX succeeded  models_used=[scnet_onnx]")
                return scnet_list, ["scnet_onnx"]
            _log.warning(
                "4-stem: SCNet ONNX failed or returned None, falling back to Demucs"
            )
        elif onnx_path is not None:
            _log.warning(
                "4-stem: SCNet ONNX present but disabled by self-test (%s); using Demucs",
                scnet_onnx_disable_reason(),
            )
    elif four_stem_skip_scnet():
        _log.info("4-stem: FOUR_STEM_BACKEND=hybrid — skipping SCNet")

    _log.info("4-stem: using hybrid pipeline (Stage 1 + PyTorch Demucs subprocess)")
    return run_hybrid_4stem(
        input_path,
        output_dir,
        prefer_speed=prefer_speed,
        model_tier=model_tier,
        progress_callback=progress_callback,
        job_logger=_log,
    )


def run_hybrid_4stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    model_tier: str = "balanced",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
    vocal_model_override: Path | None = None,
    inst_model_override: Path | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Stage 1: Extract vocals via 2-stem waterfall (MDX ranks 1–3, then Demucs htdemucs 2-stem).
    Phase inversion: instrumental = original - vocals (skip if Demucs gives instrumental).
    Stage 2: Demucs 4-stem on instrumental → drums, bass, other.
    prefer_speed=True: VAD pre-trim when USE_VAD_PRETRIM; faster Stage 1 overlap.
    prefer_speed=False: full-length input (same as 2-stem quality); higher Stage 1 overlap.
    progress_callback: optional callable(percent) called at stage boundaries.
    Returns [(stem_id, path), ...] in order: vocals, drums, bass, other.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Match 2-stem semantics: speed → VAD trim when enabled; quality → full file (less bleed / predictable length)
    # Pass None to follow USE_VAD_PRETRIM env var
    effective_input = _effective_input_path(input_path, output_dir)

    stage1_out = output_dir / "stage1"
    vocals_path, stage1_instrumental, stage1_models, inst_src = extract_vocals_stage1(
        effective_input,
        stage1_out,
        prefer_speed=prefer_speed,
        model_tier=model_tier,
        job_logger=job_logger,
        vocal_model_override=vocal_model_override,
        inst_model_override=inst_model_override,
    )
    if progress_callback:
        progress_callback(35)

    instrumental_path = output_dir / "instrumental.wav"
    _materialize_stage1_instrumental(
        effective_input,
        vocals_path,
        stage1_instrumental,
        inst_src,
        instrumental_path,
    )

    if progress_callback:
        progress_callback(40)

    stage2_out = output_dir / "stage2"
    stem_files = run_demucs(
        instrumental_path, stage2_out, stems=4, prefer_speed=prefer_speed
    )
    if progress_callback:
        progress_callback(80)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    result: list[tuple[str, Path]] = []

    dest_vocals = flat_dir / "vocals.wav"
    shutil.copy2(vocals_path, dest_vocals)
    result.append(("vocals", dest_vocals))

    for stem_id, src in stem_files:
        if stem_id == "vocals":
            continue
        dest = flat_dir / f"{stem_id}.wav"
        shutil.copy2(src, dest)
        result.append((stem_id, dest))

    if progress_callback:
        progress_callback(100)
    models_used = stage1_models + ["htdemucs"]
    return result, models_used


def run_hybrid_2stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    model_tier: str = "balanced",
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
    vocal_model_override: Path | None = None,
    inst_model_override: Path | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    2-stem separation: vocals + instrumental.

    Speed mode (prefer_speed=True):
      - VAD pre-trim to vocal span (same as 4-stem speed path)
      - 50% ONNX overlap (faster processing)
    Quality mode (prefer_speed=False):
      - Full file, no trim
      - 75% ONNX overlap (smoother chunk boundaries, less bleed)

    Stage 1 waterfall: rank1 UVR_MDXNET_3_9662 (or vocal_model_override) → rank2 KARA →
    rank3 MDX23C pair → rank4 PyTorch htdemucs 2-stem.

    Returns [(stem_id, path), ...]: [("vocals", ...), ("instrumental", ...)].
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)

    # Speed mode: VAD pre-trim to vocal span (skip silence at start/end)
    # Quality mode: process full file for best boundary accuracy
    # Pass None to follow USE_VAD_PRETRIM env var
    effective_input = _effective_input_path(input_path, output_dir)

    # Stage 1: ranked ONNX then Demucs (see vocal_stage1.extract_vocals_stage1)
    stage1_out = output_dir / "stage1"
    vocals_path, stage1_instrumental, stage1_models, inst_src = extract_vocals_stage1(
        effective_input,
        stage1_out,
        prefer_speed=prefer_speed,
        model_tier=model_tier,
        job_logger=job_logger,
        vocal_model_override=vocal_model_override,
        inst_model_override=inst_model_override,
    )

    instrumental_path = output_dir / "instrumental.wav"
    _materialize_stage1_instrumental(
        effective_input,
        vocals_path,
        stage1_instrumental,
        inst_src,
        instrumental_path,
    )

    if progress_callback:
        progress_callback(50)

    dest_v = flat_dir / "vocals.wav"
    dest_i = flat_dir / "instrumental.wav"
    shutil.copy2(vocals_path, dest_v)
    shutil.copy2(instrumental_path, dest_i)
    if progress_callback:
        progress_callback(100)
    return [("vocals", dest_v), ("instrumental", dest_i)], stage1_models


def run_demucs_only_2stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    2-stem separation using PyTorch Demucs only (no MDX ONNX Stage 1 waterfall).
    Same flat layout as ``run_hybrid_2stem``: ``stems/vocals.wav`` and ``stems/instrumental.wav``.
    VAD pre-trim matches hybrid when ``prefer_speed`` and ``USE_VAD_PRETRIM`` apply.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    _log = job_logger or logger
    effective_input = _effective_input_path(input_path, output_dir)
    stage_out = output_dir / "stage1_demucs"
    _log.info(
        "2-stem demucs_only: PyTorch htdemucs --two-stems=vocals (prefer_speed=%s)",
        prefer_speed,
    )
    stem_files = run_demucs(
        effective_input, stage_out, stems=2, prefer_speed=prefer_speed
    )
    if progress_callback:
        progress_callback(50)
    dest_v = flat_dir / "vocals.wav"
    dest_i = flat_dir / "instrumental.wav"
    for stem_id, src in stem_files:
        if stem_id == "vocals":
            shutil.copy2(src, dest_v)
        elif stem_id == "instrumental":
            shutil.copy2(src, dest_i)
    if progress_callback:
        progress_callback(100)
    if not dest_v.is_file() or not dest_i.is_file():
        raise RuntimeError(
            "demucs_only 2-stem: missing vocals or instrumental after Demucs; "
            f"stem_files={stem_files!r}"
        )
    return [("vocals", dest_v), ("instrumental", dest_i)], ["htdemucs"]


def _stage1_only(input_path: Path, output_dir: Path) -> Path:
    """Stage 1 only: output vocals.wav to output_dir. For Rust orchestration."""
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stage1_out = output_dir / "stage1"
    vocals_path, _, _, _ = extract_vocals_stage1(input_path, stage1_out)
    dest = output_dir / "vocals.wav"
    shutil.copy2(vocals_path, dest)
    return dest


def _stage2_only(
    instrumental_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
) -> list[tuple[str, Path]]:
    """Stage 2 only: Demucs 4-stem on instrumental. Returns drums, bass, other (no vocals)."""
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stem_files = run_demucs(
        instrumental_path, output_dir / "stage2", stems=4, prefer_speed=prefer_speed
    )
    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    result: list[tuple[str, Path]] = []
    for stem_id, src in stem_files:
        if stem_id == "vocals":
            continue
        dest = flat_dir / f"{stem_id}.wav"
        shutil.copy2(src, dest)
        result.append((stem_id, dest))
    return result


def run_expand_to_4stem(
    source_stems_dir: Path,
    target_output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
    job_logger: "logging.Logger | None" = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Expand a 2-stem job (vocals + instrumental) to 4 stems.
    Copies vocals from source; runs SCNet or PyTorch Demucs on instrumental for drums, bass, other.
    source_stems_dir: path to job's stems/ (must contain vocals.wav and instrumental.wav).
    Returns (stem_list, models_used) with stem_list order: vocals, drums, bass, other.
    """
    target_output_dir = target_output_dir.resolve()
    flat_dir = target_output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)

    vocals_src = source_stems_dir / "vocals.wav"
    instrumental_src = source_stems_dir / "instrumental.wav"
    if not vocals_src.exists() or not instrumental_src.exists():
        raise FileNotFoundError(
            f"2-stem outputs not found: need {vocals_src} and {instrumental_src}"
        )

    if progress_callback:
        progress_callback(5)
    dest_vocals = flat_dir / "vocals.wav"
    shutil.copy2(vocals_src, dest_vocals)

    if progress_callback:
        progress_callback(10)
    stage2_flat = target_output_dir / "stage2"
    stage2_flat.mkdir(parents=True, exist_ok=True)
    stem_list: list[tuple[str, Path]] = [("vocals", dest_vocals)]
    models_used: list[str] = []

    stem_files_rest: list[tuple[str, Path]] = []
    _log = job_logger or logger
    if not four_stem_skip_scnet() and scnet_available():
        if scnet_torch_available():
            _log.info("expand: trying SCNet PyTorch on instrumental")
            scnet_list = run_scnet_torch_4stem(
                instrumental_src, stage2_flat, prefer_speed=prefer_speed
            )
            if scnet_list is not None:
                for stem_id, src in scnet_list:
                    if stem_id == "vocals":
                        continue
                    dest = flat_dir / f"{stem_id}.wav"
                    shutil.copy2(src, dest)
                    stem_list.append((stem_id, dest))
                models_used = ["scnet_torch"]
                _log.info("expand: SCNet PyTorch succeeded  models_used=%s", models_used)
            else:
                _log.warning(
                    "expand: SCNet PyTorch returned None  trying ONNX or Demucs"
                )

        if len(stem_list) == 1:
            onnx_path = get_scnet_onnx_path()
            if onnx_path is not None and scnet_onnx_runtime_available():
                _log.info("expand: trying SCNet ONNX on instrumental")
                scnet_list = run_scnet_onnx_4stem(
                    instrumental_src, stage2_flat, prefer_speed=prefer_speed
                )
                if scnet_list is not None:
                    for stem_id, src in scnet_list:
                        if stem_id == "vocals":
                            continue
                        dest = flat_dir / f"{stem_id}.wav"
                        shutil.copy2(src, dest)
                        stem_list.append((stem_id, dest))
                    models_used = ["scnet_onnx"]
                    _log.info(
                        "expand: SCNet ONNX succeeded  models_used=%s", models_used
                    )
                else:
                    _log.warning(
                        "expand: SCNet ONNX returned None  falling back to Demucs"
                    )
            elif onnx_path is not None:
                _log.warning(
                    "expand: SCNet ONNX disabled by self-test (%s); using Demucs path",
                    scnet_onnx_disable_reason(),
                )
    else:
        if four_stem_skip_scnet():
            _log.info("expand: FOUR_STEM_BACKEND=hybrid — skipping SCNet; using Demucs")
        else:
            _log.info("expand: scnet_available=False  using Demucs path")

    if len(stem_list) == 1:
        _log.info("expand: using Demucs subprocess (htdemucs)")
        stem_files_rest = _stage2_only(
            instrumental_src, target_output_dir, prefer_speed=prefer_speed
        )
        for stem_id, dest in stem_files_rest:
            stem_list.append((stem_id, dest))
        models_used = ["htdemucs"]

    if progress_callback:
        progress_callback(100)
    return stem_list, models_used


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Hybrid stem separation (Stage 1 + inversion + Stage 2)"
    )
    subparsers = parser.add_subparsers(dest="command", help="stage1 | stage2 | full")
    # stage1: input -> vocals.wav (for Rust: then Rust does inversion)
    p1 = subparsers.add_parser(
        "stage1", help="Extract vocals only; write output_dir/vocals.wav"
    )
    p1.add_argument("input", type=Path)
    p1.add_argument("--out-dir", type=Path, required=True)
    # stage2: instrumental.wav -> drums, bass, other in output_dir/stems/
    p2 = subparsers.add_parser(
        "stage2", help="Demucs 4-stem on instrumental; write output_dir/stems/"
    )
    p2.add_argument("instrumental", type=Path)
    p2.add_argument("--out-dir", type=Path, required=True)
    # full: one-shot (Python does inversion)
    p3 = subparsers.add_parser(
        "full", help="Full hybrid: input -> stems (vocals, drums, bass, other)"
    )
    p3.add_argument("input", type=Path)
    p3.add_argument("--out-dir", type=Path, required=True)
    p3.add_argument("--stems", type=int, default=4, choices=(2, 4))

    args = parser.parse_args()

    if args.command == "stage1":
        if not args.input.exists():
            print(
                json.dumps({"error": f"Input not found: {args.input}"}), file=sys.stderr
            )
            return 1
        try:
            p = _stage1_only(args.input, args.out_dir)
            print(json.dumps({"vocals_path": str(p)}))
            return 0
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            return 1

    if args.command == "stage2":
        if not args.instrumental.exists():
            print(
                json.dumps({"error": f"Instrumental not found: {args.instrumental}"}),
                file=sys.stderr,
            )
            return 1
        try:
            stems = _stage2_only(args.instrumental, args.out_dir)
            out_base = args.out_dir.resolve()
            print(
                json.dumps(
                    {
                        "stems": [
                            {"id": sid, "path": str(p.relative_to(out_base))}
                            for sid, p in stems
                        ],
                    }
                )
            )
            return 0
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            return 1

    if args.command == "full":
        if not args.input.exists():
            print(
                json.dumps({"error": f"Input not found: {args.input}"}), file=sys.stderr
            )
            return 1
        try:
            if args.stems == 2:
                stem_list, _models = run_hybrid_2stem(args.input, args.out_dir)
            else:
                stem_list, _models = run_hybrid_4stem(args.input, args.out_dir)
            out_base = args.out_dir.resolve()
            payload = {
                "stems": [
                    {"id": stem_id, "path": str(p.relative_to(out_base))}
                    for stem_id, p in stem_list
                ],
            }
            print(json.dumps(payload))
            return 0
        except Exception as e:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
            return 1

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
