#!/usr/bin/env python3
"""
Automated pipeline metrics: run the same hybrid paths the API uses and record
which models ran, wall time, and realtime factor (RTF). Output matches
job_metrics.jsonl fields so you can compare with production logs.

Usage (repo root, venv active):
  python scripts/track_pipeline_metrics.py
  python scripts/track_pipeline_metrics.py path/to/song.wav --clip-seconds 15
  python scripts/track_pipeline_metrics.py --quick
  python scripts/track_pipeline_metrics.py --append-jsonl job_metrics.jsonl

Environment (optional, same as stem service):
  USE_SCNET, USE_VAD_PRETRIM, STEM_BACKEND, ONNXRUNTIME_NUM_THREADS, etc.

This script sets USE_VAD_PRETRIM=0 for repeatable timings unless already set.

Default input when no positional argument is given (first match wins):
  1. Environment variable BENCHMARK_SONG (absolute path to WAV)
  2. File benchmark_song.local.txt in repo root (one line: path to WAV)
  3. Otherwise a short synthetic clip is generated.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Deterministic benchmark: full clip processed (override with USE_VAD_PRETRIM=1 if you want).
if "USE_VAD_PRETRIM" not in os.environ:
    os.environ["USE_VAD_PRETRIM"] = "0"


def resolve_benchmark_input_path() -> Path | None:
    """Optional default WAV: BENCHMARK_SONG env, then repo benchmark_song.local.txt."""
    env = (os.environ.get("BENCHMARK_SONG") or "").strip().strip('"')
    if env:
        p = Path(env).expanduser()
        if p.is_file():
            return p.resolve()
        print(f"Warning: BENCHMARK_SONG does not exist: {p}", file=sys.stderr)
    local = REPO_ROOT / "benchmark_song.local.txt"
    if local.is_file():
        for line in local.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            p = Path(line).expanduser()
            if p.is_file():
                return p.resolve()
            print(f"Warning: path in {local.name} not found: {p}", file=sys.stderr)
    return None


def make_metrics_record(
    *,
    mode_name: str,
    stem_count: int,
    prefer_speed: bool,
    models_used: list[str],
    elapsed_seconds: float,
    audio_duration_seconds: float,
    run_id: str,
    output_dir: str,
) -> dict:
    """Build one record aligned with stem_service job_metrics.jsonl schema."""
    rtf: float | None = None
    if audio_duration_seconds > 0:
        rtf = round(elapsed_seconds / audio_duration_seconds, 4)
    return {
        "job_id": run_id,
        "completed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mode_name": mode_name,
        "stem_count": stem_count,
        "quality_mode": "speed" if prefer_speed else "quality",
        "prefer_speed": prefer_speed,
        "elapsed_seconds": round(elapsed_seconds, 2),
        "audio_duration_seconds": round(audio_duration_seconds, 2),
        "realtime_factor": rtf,
        "models_used": models_used,
        "benchmark": True,
        "benchmark_output_dir": output_dir,
    }


def _ensure_clip(input_path: Path, clip_path: Path, clip_seconds: float) -> None:
    import soundfile as sf

    data, sr = sf.read(str(input_path), dtype="float32", always_2d=True)
    n = min(int(clip_seconds * sr), data.shape[0])
    clip_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(clip_path), data[:n], sr, subtype="PCM_16")


def _default_noise_wav(path: Path, seconds: float = 8.0, sr: int = 44100) -> None:
    """Tiny synthetic stereo clip so the script runs without a user file."""
    import random
    import struct
    import wave

    path.parent.mkdir(parents=True, exist_ok=True)
    random.seed(42)
    n = int(seconds * sr)
    frames = []
    for _ in range(2 * n):
        s = (random.random() * 2 - 1) * 0.12
        frames.append(struct.pack("<h", max(-32768, min(32767, int(s * 32767)))))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"".join(frames))


def _audio_duration(path: Path) -> float:
    import soundfile as sf

    return float(sf.info(str(path)).duration)


def run_matrix(
    clip_path: Path,
    work_root: Path,
    *,
    quick: bool,
    skip_4stem: bool,
) -> list[dict]:
    from stem_service.hybrid import run_4stem_single_pass_or_hybrid, run_hybrid_2stem

    duration_s = _audio_duration(clip_path)
    runs: list[tuple[str, int, bool]] = []
    if quick:
        runs = [("2_stem_speed", 2, True)]
    else:
        runs.extend(
            [
                ("2_stem_speed", 2, True),
                ("2_stem_quality", 2, False),
            ]
        )
        if not skip_4stem:
            runs.extend(
                [
                    ("4_stem_speed", 4, True),
                    ("4_stem_quality", 4, False),
                ]
            )

    records: list[dict] = []
    for mode_name, stem_count, prefer_speed in runs:
        run_id = str(uuid.uuid4())
        out_dir = work_root / mode_name / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        t0 = time.monotonic()
        try:
            if stem_count == 2:
                _stems, models_used = run_hybrid_2stem(
                    clip_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    progress_callback=None,
                    job_logger=None,
                )
            else:
                _stems, models_used = run_4stem_single_pass_or_hybrid(
                    clip_path,
                    out_dir,
                    prefer_speed=prefer_speed,
                    progress_callback=None,
                    job_logger=None,
                )
            elapsed = time.monotonic() - t0
            rec = make_metrics_record(
                mode_name=mode_name,
                stem_count=stem_count,
                prefer_speed=prefer_speed,
                models_used=models_used,
                elapsed_seconds=elapsed,
                audio_duration_seconds=duration_s,
                run_id=run_id,
                output_dir=str(out_dir),
            )
            records.append(rec)
            print(
                f"OK  {mode_name:18}  RTF={rec['realtime_factor']}  "
                f"{rec['elapsed_seconds']}s  models={models_used}"
            )
        except Exception as e:
            elapsed = time.monotonic() - t0
            rec = make_metrics_record(
                mode_name=mode_name,
                stem_count=stem_count,
                prefer_speed=prefer_speed,
                models_used=[],
                elapsed_seconds=elapsed,
                audio_duration_seconds=duration_s,
                run_id=run_id,
                output_dir=str(out_dir),
            )
            rec["error"] = str(e)
            records.append(rec)
            print(f"FAIL {mode_name:18}  {e}")
    return records


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run hybrid pipeline matrix and record models_used + RTF."
    )
    parser.add_argument(
        "input",
        type=Path,
        nargs="?",
        default=None,
        help="Audio file (wav/mp3/flac...). If omitted, generates a short synthetic clip.",
    )
    parser.add_argument(
        "--clip-seconds",
        type=float,
        default=12.0,
        help="Use only the first N seconds (default 12). Ignored for synthetic default input length.",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Only run 2_stem_speed (smoke / fastest).",
    )
    parser.add_argument(
        "--skip-4stem",
        action="store_true",
        help="Only run 2-stem modes (skip 4-stem; saves time).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Work directory (default: tmp/pipeline_metrics_<UTC timestamp>).",
    )
    parser.add_argument(
        "--append-jsonl",
        type=Path,
        default=None,
        help="Append each record as one JSON line to this file (e.g. job_metrics.jsonl).",
    )
    args = parser.parse_args()

    input_path = args.input
    if input_path is None:
        input_path = resolve_benchmark_input_path()
        if input_path is not None:
            print(f"Default benchmark input: {input_path}")

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    work_root = (
        args.output_dir.resolve()
        if args.output_dir
        else (REPO_ROOT / "tmp" / f"pipeline_metrics_{ts}")
    )
    work_root.mkdir(parents=True, exist_ok=True)
    clip_path = work_root / "input_clip.wav"

    if input_path is not None:
        src = input_path.resolve()
        if not src.exists():
            print(f"Input not found: {src}", file=sys.stderr)
            return 1
        print(f"Clipping first {args.clip_seconds}s from {src.name} -> {clip_path.name}")
        _ensure_clip(src, clip_path, args.clip_seconds)
    else:
        sec = max(5.0, min(args.clip_seconds, 30.0))
        print(f"No input file; generating {sec:.0f}s synthetic stereo clip")
        _default_noise_wav(clip_path, seconds=sec)

    print(f"Work root: {work_root}")
    print("--- runs ---")
    records = run_matrix(
        clip_path,
        work_root,
        quick=args.quick,
        skip_4stem=args.skip_4stem,
    )

    jsonl_path = work_root / "pipeline_metrics.jsonl"
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"\nWrote {jsonl_path}")

    csv_path = work_root / "pipeline_metrics.csv"
    if records:
        fields = [
            "mode_name",
            "stem_count",
            "quality_mode",
            "prefer_speed",
            "elapsed_seconds",
            "audio_duration_seconds",
            "realtime_factor",
            "models_used",
            "error",
            "benchmark_output_dir",
            "job_id",
        ]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            w.writeheader()
            for rec in records:
                row = {
                    **rec,
                    "models_used": "|".join(rec.get("models_used") or []),
                    "error": rec.get("error", ""),
                    "benchmark_output_dir": rec.get("benchmark_output_dir", ""),
                }
                w.writerow(row)
        print(f"Wrote {csv_path}")

    if args.append_jsonl:
        append_path = args.append_jsonl.resolve()
        append_path.parent.mkdir(parents=True, exist_ok=True)
        with open(append_path, "a", encoding="utf-8") as f:
            for rec in records:
                if "error" not in rec:
                    # Match production log: no benchmark-only keys if you want strict parity;
                    # we keep benchmark flags for grep-friendly analysis.
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print(f"Appended {len(records)} line(s) to {append_path}")

    failed = sum(1 for r in records if "error" in r)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
