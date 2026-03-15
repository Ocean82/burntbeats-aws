"""
Hybrid pipeline (AGENT-GUIDE): Stage 1 vocals → phase inversion → Stage 2 Demucs on instrumental.
Optional: Silero VAD pre-trim (USE_VAD_PRETRIM=1) to process only vocal span for speed.
Output: vocals, drums, bass, other (4 stems). Optional 2-stem: vocals + instrumental only.
"""

from __future__ import annotations

import argparse
import json
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
)
from stem_service.demucs_onnx import (
    demucs_onnx_6s_available,
    demucs_onnx_embedded_available,
    run_demucs_onnx_4stem,
)
from stem_service.phase_inversion import create_perfect_instrumental
from stem_service.split import run_demucs
from stem_service.vad import (
    get_chunk_boundaries,
    is_vad_available,
    trim_audio_to_speech_span,
)
from stem_service.vocal_stage1 import extract_vocals_stage1


def _effective_input_path(
    input_path: Path,
    output_dir: Path,
    use_vad_trim: bool | None = None,
) -> Path:
    """If VAD trim requested and VAD available, trim to speech span; else return input.
    use_vad_trim: True = trim when VAD available; False = never trim; None = follow USE_VAD_PRETRIM env.
    """
    if use_vad_trim is False:
        return input_path
    if use_vad_trim is not True and not USE_VAD_PRETRIM:
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
) -> list[tuple[str, Path]] | None:
    """
    VAD-chunked 4-stem separation (Option B from VADSLICE doc).
    Slices input at silence boundaries, runs separation per chunk,
    then concatenates stems. Returns None if VAD unavailable or
    only one chunk found (caller falls back to full-file processing).
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
    chunks_dir = output_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    for i, (start_s, end_s) in enumerate(boundaries):
        if progress_callback:
            progress_callback(int(10 + (i / len(boundaries)) * 80))

        chunk_path = chunks_dir / f"chunk_{i:03d}.wav"
        _slice_audio(input_path, start_s, end_s, chunk_path)

        chunk_out = chunks_dir / f"chunk_{i:03d}_stems"
        chunk_out.mkdir(parents=True, exist_ok=True)

        stems = run_demucs_onnx_4stem(chunk_path, chunk_out, use_6s=not prefer_speed)
        if stems is None:
            stems = run_hybrid_4stem(chunk_path, chunk_out, prefer_speed=prefer_speed)
        chunk_stem_lists.append(stems)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    result = _concat_stems(chunk_stem_lists, flat_dir)

    if progress_callback:
        progress_callback(100)
    return result


def run_4stem_single_pass_or_hybrid(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
) -> list[tuple[str, Path]]:
    """
    Entry point for 4-stem separation.
    - If USE_VAD_CHUNKS=1 and VAD available: slice at silence boundaries,
      run separation per chunk, concatenate (Option B from VADSLICE doc).
    - Otherwise: try single-pass Demucs ONNX (embedded=speed, 6s=quality),
      then fall back to hybrid pipeline.
    Returns [(stem_id, path), ...] in order: vocals, drums, bass, other.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # VAD chunked path
    if USE_VAD_CHUNKS:
        chunked = _run_chunked_4stem(
            input_path,
            output_dir,
            prefer_speed=prefer_speed,
            progress_callback=progress_callback,
        )
        if chunked is not None:
            return chunked

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)

    use_6s = not prefer_speed
    if (use_6s and demucs_onnx_6s_available()) or (
        not use_6s and demucs_onnx_embedded_available()
    ):
        if progress_callback:
            progress_callback(10)
        stem_list = run_demucs_onnx_4stem(input_path, flat_dir, use_6s=use_6s)
        if stem_list is not None:
            if progress_callback:
                progress_callback(100)
            return stem_list

    return run_hybrid_4stem(
        input_path,
        output_dir,
        prefer_speed=prefer_speed,
        progress_callback=progress_callback,
    )


def run_hybrid_4stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
) -> list[tuple[str, Path]]:
    """
    Stage 1: Extract vocals (Demucs 2-stem or ONNX when available).
    Phase inversion: instrumental = original - vocals (skip if Demucs gives instrumental).
    Stage 2: Demucs 4-stem on instrumental → drums, bass, other.
    prefer_speed=True: VAD pre-trim when available, Stage 1 Demucs only.
    prefer_speed=False: full file, ONNX when available.
    progress_callback: optional callable(percent) called at stage boundaries.
    Returns [(stem_id, path), ...] in order: vocals, drums, bass, other.
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # VAD trim: processes only first-to-last speech span → faster when there's leading/trailing silence; output stems are shorter (see docs/VAD-PRETRIM-TRADEOFF.md)
    use_vad = True  # Set False or USE_VAD_PRETRIM=0 for full-length stems
    effective_input = _effective_input_path(
        input_path, output_dir, use_vad_trim=use_vad
    )

    stage1_out = output_dir / "stage1"
    vocals_path, stage1_instrumental = extract_vocals_stage1(
        effective_input, stage1_out, prefer_speed=prefer_speed
    )
    if progress_callback:
        progress_callback(35)

    # Skip phase inversion if Demucs already gave us instrumental (faster!)
    instrumental_path = output_dir / "instrumental.wav"
    if stage1_instrumental is not None:
        shutil.copy2(stage1_instrumental, instrumental_path)
    else:
        create_perfect_instrumental(effective_input, vocals_path, instrumental_path)

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
    return result


def run_hybrid_2stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = False,
    progress_callback: Callable[[int], None] | None = None,
) -> list[tuple[str, Path]]:
    """
    2-stem separation: vocals + instrumental.

    ONNX-first (both Speed and Quality): use MDX vocal ONNX (+ instrumental ONNX or
    phase inversion) when available; no subprocess. Falls back to Demucs 2-stem
    subprocess only when no vocal ONNX is found. This keeps 2-stem efficient
    (in-process, lower memory) when models/mdxnet_models (or equivalent) are present.

    Returns [(stem_id, path), ...]: [("vocals", ...), ("instrumental", ...)].
    """
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)

    # ONNX-first: Stage 1 vocal (+ optional inst) or Demucs 2-stem fallback
    stage1_out = output_dir / "stage1"
    vocals_path, stage1_instrumental = extract_vocals_stage1(
        input_path, stage1_out, prefer_speed=prefer_speed
    )

    instrumental_path = output_dir / "instrumental.wav"
    if stage1_instrumental is not None:
        shutil.copy2(stage1_instrumental, instrumental_path)
    else:
        create_perfect_instrumental(input_path, vocals_path, instrumental_path)

    if progress_callback:
        progress_callback(50)

    dest_v = flat_dir / "vocals.wav"
    dest_i = flat_dir / "instrumental.wav"
    shutil.copy2(vocals_path, dest_v)
    shutil.copy2(instrumental_path, dest_i)
    if progress_callback:
        progress_callback(100)
    return [("vocals", dest_v), ("instrumental", dest_i)]


def _stage1_only(input_path: Path, output_dir: Path) -> Path:
    """Stage 1 only: output vocals.wav to output_dir. For Rust orchestration."""
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stage1_out = output_dir / "stage1"
    vocals_path, _ = extract_vocals_stage1(input_path, stage1_out)
    dest = output_dir / "vocals.wav"
    shutil.copy2(vocals_path, dest)
    return dest


def _stage2_only(instrumental_path: Path, output_dir: Path) -> list[tuple[str, Path]]:
    """Stage 2 only: Demucs 4-stem on instrumental. Returns drums, bass, other (no vocals)."""
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stem_files = run_demucs(instrumental_path, output_dir / "stage2", stems=4)
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
                stem_list = run_hybrid_2stem(args.input, args.out_dir)
            else:
                stem_list = run_hybrid_4stem(args.input, args.out_dir)
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
