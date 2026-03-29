#!/usr/bin/env python3
"""
Benchmark all stem-separation models on a 30-second clip of a song.

- Trims the input file to the first N seconds (default 30).
- Runs 2-stem separation for each vocal and each instrumental ONNX model (with overrides).
- Runs 4-stem separation for each Demucs ONNX model.
- Saves stems under output_dir grouped by model name; writes summary CSV/JSON with timings and RTF.

Usage (from repo root):
  python scripts/run_model_benchmark.py path/to/your_song.wav [--output-dir benchmark_out] [--clip-seconds 30]
  # Or with venv (Windows): .venv\\Scripts\\activate
  # WSL/Linux: source .venv/bin/activate
  python scripts/run_model_benchmark.py path/to/song.wav

Output:
  {output_dir}/
    input_30s.wav          # trimmed clip
    2stem/
      {vocal_name}__phase_inversion/   # vocals + instrumental (phase inv)
        vocals.wav, instrumental.wav
      {vocal_name}__{inst_name}/       # when both models used
        vocals.wav, instrumental.wav
    4stem/
      {demucs_model_name}/
        vocals.wav, drums.wav, bass.wav, other.wav
    summary.json
    summary.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

# Disable VAD pre-trim so the full clip is always separated (consistent benchmark).
os.environ["USE_VAD_PRETRIM"] = "0"

# Repo root and stem_service on path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from stem_service.config import MODELS_DIR, REPO_ROOT
from stem_service.demucs_onnx import (
    EMBEDDED_ONNX,
    HTDEMUCS_ONNX,
    SIX_STEM_ONNX,
    V4_ONNX,
    run_demucs_onnx_4stem,
)
from stem_service.hybrid import run_hybrid_2stem
from stem_service.mdx_onnx import INST_MODEL_PATHS, VOCAL_MODEL_PATHS


def trim_audio(input_path: Path, output_path: Path, seconds: float) -> Path:
    """Write first `seconds` of input to output_path. Returns output_path."""
    import soundfile as sf

    data, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    n = min(int(seconds * sr), data.shape[0])
    out = data[:n]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), out, sr, subtype="PCM_16")
    return output_path


def existing_models_by_name(path_list: list[Path]) -> dict[str, Path]:
    """Return dict of path.name -> Path for each existing path (dedupe by name)."""
    out: dict[str, Path] = {}
    for p in path_list:
        if p.exists():
            out[p.name] = p.resolve()
    return out


def run_2stem_benchmark(
    input_30s: Path,
    output_base: Path,
    vocal_models: dict[str, Path],
    inst_models: dict[str, Path],
    first_vocal_name: str | None,
    audio_duration_seconds: float,
) -> list[dict]:
    """Run 2-stem for each vocal (with phase inversion) and each inst (with first vocal). Returns list of run records."""
    records: list[dict] = []
    # Test each vocal model with phase inversion for instrumental
    for name, path in vocal_models.items():
        run_key = f"{name}__phase_inversion"
        out_dir = output_base / "2stem" / run_key
        out_dir.mkdir(parents=True, exist_ok=True)
        stage1 = out_dir / "stage1"
        flat = out_dir / "stems"
        flat.mkdir(parents=True, exist_ok=True)
        t0 = time.monotonic()
        try:
            stem_list, models_used = run_hybrid_2stem(
                input_30s,
                out_dir,
                prefer_speed=False,
                progress_callback=None,
                job_logger=None,
                vocal_model_override=path,
                inst_model_override=None,
            )
            elapsed = time.monotonic() - t0
            for stem_id, p in stem_list:
                dest = flat / f"{stem_id}.wav"
                if p.resolve() != dest.resolve():
                    shutil.copy2(p, dest)
            duration_s = audio_duration_seconds
            rtf = round(elapsed / duration_s, 4) if duration_s > 0 else None
            records.append({
                "mode": "2stem",
                "run_key": run_key,
                "models_used": models_used,
                "elapsed_seconds": round(elapsed, 2),
                "audio_duration_seconds": duration_s,
                "realtime_factor": rtf,
                "output_dir": str(out_dir),
            })
            print(f"  2stem {run_key}: {elapsed:.1f}s  RTF={rtf}")
        except Exception as e:
            print(f"  2stem {run_key}: FAILED {e}")
            records.append({
                "mode": "2stem",
                "run_key": run_key,
                "models_used": [name],
                "error": str(e),
                "elapsed_seconds": round(time.monotonic() - t0, 2),
                "output_dir": str(out_dir),
            })

    # Test each inst model with first available vocal
    if first_vocal_name and first_vocal_name in vocal_models:
        first_vocal_path = vocal_models[first_vocal_name]
        for name, path in inst_models.items():
            run_key = f"{first_vocal_name}__{name}"
            out_dir = output_base / "2stem" / run_key
            out_dir.mkdir(parents=True, exist_ok=True)
            flat = out_dir / "stems"
            flat.mkdir(parents=True, exist_ok=True)
            t0 = time.monotonic()
            try:
                stem_list, models_used = run_hybrid_2stem(
                    input_30s,
                    out_dir,
                    prefer_speed=False,
                    progress_callback=None,
                    job_logger=None,
                    vocal_model_override=first_vocal_path,
                    inst_model_override=path,
                )
                elapsed = time.monotonic() - t0
                for stem_id, p in stem_list:
                    dest = flat / f"{stem_id}.wav"
                    if p.resolve() != dest.resolve():
                        shutil.copy2(p, dest)
                duration_s = audio_duration_seconds
                rtf = round(elapsed / duration_s, 4) if duration_s > 0 else None
                records.append({
                    "mode": "2stem",
                    "run_key": run_key,
                    "models_used": models_used,
                    "elapsed_seconds": round(elapsed, 2),
                    "audio_duration_seconds": duration_s,
                    "realtime_factor": rtf,
                    "output_dir": str(out_dir),
                })
                print(f"  2stem {run_key}: {elapsed:.1f}s  RTF={rtf}")
            except Exception as e:
                print(f"  2stem {run_key}: FAILED {e}")
                records.append({
                    "mode": "2stem",
                    "run_key": run_key,
                    "models_used": [first_vocal_name, name],
                    "error": str(e),
                    "elapsed_seconds": round(time.monotonic() - t0, 2),
                    "output_dir": str(out_dir),
                })
    return records


def run_4stem_benchmark(
    input_30s: Path,
    output_base: Path,
    demucs_paths: list[tuple[str, Path]],
    audio_duration_seconds: float,
) -> list[dict]:
    """Run 4-stem for each Demucs ONNX model. Returns list of run records."""
    records: list[dict] = []
    for name, path in demucs_paths:
        out_dir = output_base / "4stem" / name
        out_dir.mkdir(parents=True, exist_ok=True)
        t0 = time.monotonic()
        try:
            stem_list, model_name = run_demucs_onnx_4stem(
                input_30s,
                out_dir,
                use_6s="6s" in name.lower(),
                demucs_model_override=path,
            )
            elapsed = time.monotonic() - t0
            if stem_list is None or model_name is None:
                raise RuntimeError("run_demucs_onnx_4stem returned None")
            duration_s = audio_duration_seconds
            rtf = round(elapsed / duration_s, 4) if duration_s > 0 else None
            records.append({
                "mode": "4stem",
                "run_key": name,
                "models_used": [model_name],
                "elapsed_seconds": round(elapsed, 2),
                "audio_duration_seconds": duration_s,
                "realtime_factor": rtf,
                "output_dir": str(out_dir),
            })
            print(f"  4stem {name}: {elapsed:.1f}s  RTF={rtf}")
        except Exception as e:
            print(f"  4stem {name}: FAILED {e}")
            records.append({
                "mode": "4stem",
                "run_key": name,
                "models_used": [name],
                "error": str(e),
                "elapsed_seconds": round(time.monotonic() - t0, 2),
                "output_dir": str(out_dir),
            })
    return records


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark stem-separation models on a short clip (default 30s)."
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Path to the full song (any format soundfile supports).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "benchmark_out",
        help="Base directory for output; a date-time tag is appended (e.g. benchmark_out_2026-03-16_14-30-00).",
    )
    parser.add_argument(
        "--clip-seconds",
        type=float,
        default=30.0,
        help="Use only the first N seconds of the song (default 30).",
    )
    parser.add_argument(
        "--skip-2stem",
        action="store_true",
        help="Skip 2-stem model runs.",
    )
    parser.add_argument(
        "--skip-4stem",
        action="store_true",
        help="Skip 4-stem model runs.",
    )
    args = parser.parse_args()

    input_path = args.input.resolve()
    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    # Append date-time tag to avoid overwriting previous runs (e.g. benchmark_out_2026-03-16_14-30-00)
    resolved = args.output_dir.resolve()
    tag = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_base = resolved.parent / f"{resolved.name}_{tag}"
    output_base.mkdir(parents=True, exist_ok=True)
    print("Output directory:", output_base)
    clip_path = output_base / "input_30s.wav"

    print("Trimming input to first {} seconds...".format(args.clip_seconds))
    try:
        trim_audio(input_path, clip_path, args.clip_seconds)
    except Exception as e:
        print(f"Trim failed: {e}", file=sys.stderr)
        return 1
    print("Saved:", clip_path)

    import soundfile as sf

    audio_duration_seconds = float(sf.info(str(clip_path)).duration)

    vocal_models = existing_models_by_name(VOCAL_MODEL_PATHS)
    inst_models = existing_models_by_name(INST_MODEL_PATHS)
    first_vocal_name = next(iter(vocal_models.keys()), None) if vocal_models else None

    demucs_paths: list[tuple[str, Path]] = []
    for name, path in [
        ("htdemucs_6s", SIX_STEM_ONNX),
        ("htdemucs_embedded", EMBEDDED_ONNX),
        ("htdemucs", HTDEMUCS_ONNX),
        ("demucsv4", V4_ONNX),
    ]:
        if path.exists():
            demucs_paths.append((name, path.resolve()))

    print(f"Found {len(vocal_models)} vocal, {len(inst_models)} inst, {len(demucs_paths)} 4-stem ONNX models.")

    all_records: list[dict] = []

    if not args.skip_2stem and (vocal_models or inst_models):
        print("\n--- 2-stem runs ---")
        all_records.extend(
            run_2stem_benchmark(
                clip_path,
                output_base,
                vocal_models,
                inst_models,
                first_vocal_name,
                audio_duration_seconds,
            )
        )
    elif args.skip_2stem:
        print("\nSkipping 2-stem (--skip-2stem).")

    if not args.skip_4stem and demucs_paths:
        print("\n--- 4-stem runs ---")
        all_records.extend(
            run_4stem_benchmark(
                clip_path, output_base, demucs_paths, audio_duration_seconds
            )
        )
    elif args.skip_4stem:
        print("\nSkipping 4-stem (--skip-4stem).")

    # Summary
    summary_path = output_base / "summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "clip_seconds": args.clip_seconds,
                "audio_duration_seconds": audio_duration_seconds,
                "input_file": str(input_path),
                "runs": all_records,
            },
            f,
            indent=2,
        )
    print(f"\nSummary JSON: {summary_path}")

    csv_path = output_base / "summary.csv"
    if all_records:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "mode", "run_key", "models_used", "elapsed_seconds",
                    "audio_duration_seconds", "realtime_factor", "error", "output_dir",
                ],
                extrasaction="ignore",
            )
            w.writeheader()
            for r in all_records:
                row = {**r, "models_used": "|".join(r.get("models_used", []))}
                if "error" not in row:
                    row["error"] = ""
                w.writerow(row)
        print(f"Summary CSV: {csv_path}")

    print("\nDone. Stems are under {} grouped by model name.".format(output_base))
    return 0


if __name__ == "__main__":
    sys.exit(main())
