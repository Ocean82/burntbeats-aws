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

from stem_service.config import USE_VAD_PRETRIM
from stem_service.phase_inversion import create_perfect_instrumental
from stem_service.split import run_demucs
from stem_service.vad import is_vad_available, trim_audio_to_speech_span
from stem_service.vocal_stage1 import extract_vocals_stage1


def _effective_input_path(
    input_path: Path,
    output_dir: Path,
    use_vad_trim: bool | None = None,
) -> Path:
    """If VAD trim requested and VAD available, trim to speech span; else return input.
    use_vad_trim: True = trim when VAD available; False = never trim; None = follow USE_VAD_PRETRIM env."""
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

    # Use VAD for both speed AND quality (quality improvement + speed)
    use_vad = True  # VAD helps both modes
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
    """Vocals + instrumental only (Stage 1 + inversion, no Stage 2).
    prefer_speed: VAD trim + Demucs-only Stage 1.
    progress_callback: optional callable(percent) with 50, 100."""
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Use VAD for both speed AND quality
    use_vad = True
    effective_input = _effective_input_path(
        input_path, output_dir, use_vad_trim=use_vad
    )

    stage1_out = output_dir / "stage1"
    vocals_path, stage1_instrumental = extract_vocals_stage1(
        effective_input, stage1_out, prefer_speed=prefer_speed
    )

    # Skip phase inversion if Demucs already gave instrumental
    instrumental_path = output_dir / "instrumental.wav"
    if stage1_instrumental is not None:
        shutil.copy2(stage1_instrumental, instrumental_path)
    else:
        create_perfect_instrumental(effective_input, vocals_path, instrumental_path)

    if progress_callback:
        progress_callback(50)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
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
