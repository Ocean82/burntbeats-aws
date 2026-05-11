"""
4-stem separation pipelines: SCNet → hybrid (Stage 1 + Demucs subprocess).

Entry point: run_4stem_single_pass_or_hybrid (dispatches to SCNet or hybrid).
Core: run_hybrid_4stem (Stage 1 vocals → phase inversion → Stage 2 Demucs on instrumental).

See docs/stem-pipeline.md for routing documentation.
See docs/research/ONNX-RUNTIME.md for locked production policies.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Callable

from stem_service.config import (
    USE_VAD_CHUNKS,
    VAD_CHUNK_LENGTH_S,
    VAD_CHUNK_SILENCE_FLUSH_S,
    four_stem_skip_scnet,
    get_scnet_onnx_path,
    scnet_available,
    scnet_torch_available,
)
from stem_service.scnet_onnx import (
    run_scnet_onnx_4stem,
    scnet_onnx_disable_reason,
    scnet_onnx_runtime_available,
)
from stem_service.scnet_torch import run_scnet_torch_4stem
from stem_service.split import run_demucs
from stem_service.vad import get_chunk_boundaries, is_vad_available
from stem_service.vocal_stage1 import extract_vocals_stage1

from stem_service.hybrid.utils import (
    _concat_stems,
    _effective_input_path,
    _materialize_stage1_instrumental,
    _slice_audio,
)

logger = logging.getLogger(__name__)


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
    if not is_vad_available():
        return None

    boundaries = get_chunk_boundaries(
        input_path,
        chunk_length_s=float(VAD_CHUNK_LENGTH_S),
        silence_flush_s=VAD_CHUNK_SILENCE_FLUSH_S,
    )
    if boundaries is None or len(boundaries) <= 1:
        return None

    _log = job_logger or logger
    _log.info("VAD chunking: %d chunks for %s", len(boundaries), input_path.name)

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
    - Otherwise: PyTorch htdemucs by default (FOUR_STEM_BACKEND=hybrid).
      With FOUR_STEM_BACKEND=auto, try SCNet ONNX first, then hybrid.
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

    # 4-stem: default skips SCNet (FOUR_STEM_BACKEND=hybrid).
    # auto tries PyTorch SCNet repo, then ONNX, then Demucs.
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

    effective_input = _effective_input_path(input_path, output_dir)

    stage1_out = output_dir / "stage1"
    if progress_callback:
        progress_callback(5)
    vocals_path, stage1_instrumental, stage1_models, inst_src = extract_vocals_stage1(
        effective_input,
        stage1_out,
        prefer_speed=prefer_speed,
        model_tier=model_tier,
        job_logger=job_logger,
        vocal_model_override=vocal_model_override,
        inst_model_override=inst_model_override,
        progress_callback=progress_callback,
        progress_range=(5, 35),
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
