#!/usr/bin/env python3
"""
Minimal pipeline timing probe for the EC2 stem_service Docker container.

Copy to the instance and run inside the container after placing a 30s WAV at /tmp/input_30s.wav:

  sudo docker cp input_30s.wav burntbeats-aws-stem_service-1:/tmp/input_30s.wav
  sudo docker cp scripts/ec2_container_benchmark.py burntbeats-aws-stem_service-1:/tmp/ec2_container_benchmark.py
  sudo docker exec \\
    -e USE_GPU=0 -e USE_ONNX_CPU=1 \\
    -e STEM_CPU_WORKERS=1 -e STEM_CPU_THREADS=2 -e STEM_CPU_INTEROP_THREADS=1 \\
    burntbeats-aws-stem_service-1 python /tmp/ec2_container_benchmark.py

Uses intent router + execute_plan when available; otherwise legacy hybrid paths.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(os.environ.get("REPO_ROOT", "/repo"))
sys.path.insert(0, str(REPO))
os.environ.setdefault("USE_GPU", "0")
os.environ.setdefault("USE_ONNX_CPU", "1")
os.environ.setdefault("STEM_CPU_WORKERS", "1")
os.environ.setdefault("STEM_CPU_THREADS", "2")
os.environ.setdefault("STEM_CPU_INTEROP_THREADS", "1")

CLIP = Path(os.environ.get("BENCHMARK_CLIP", "/tmp/input_30s.wav"))
OUT_ROOT = Path(
    os.environ.get(
        "BENCHMARK_OUT",
        "/tmp/ec2_bench_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
    )
)
OUT_ROOT.mkdir(parents=True, exist_ok=True)


def duration_s(path: Path) -> float:
    import soundfile as sf

    return float(sf.info(str(path)).duration)


def _run_matrix() -> list[dict]:
    clip_dur = duration_s(CLIP)
    runs = [
        ("2_stem_speed", 2, True),
        ("2_stem_quality", 2, False),
        ("4_stem_speed", 4, True),
        ("4_stem_quality", 4, False),
    ]
    records: list[dict] = []

    try:
        from stem_service.routing import execute_plan, route_intent
        from stem_service.routing.schema import SplitIntent

        use_router = True
    except ImportError:
        use_router = False

    if use_router:
        from stem_service.routing import execute_plan, route_intent
        from stem_service.routing.schema import SplitIntent
    else:
        from stem_service.hybrid import run_4stem_single_pass_or_hybrid, run_hybrid_2stem

    host_label = "ec2_container_route1" if use_router else "ec2_container_legacy_hybrid"

    for mode_name, stem_count, prefer_speed in runs:
        out_dir = OUT_ROOT / mode_name / str(uuid.uuid4())
        out_dir.mkdir(parents=True, exist_ok=True)
        t0 = time.monotonic()
        rec: dict = {
            "mode_name": mode_name,
            "audio_duration_seconds": clip_dur,
            "benchmark_host": host_label,
        }
        try:
            if use_router:
                quality = "fast" if prefer_speed else "high"
                intent = SplitIntent(
                    task="full_separation",
                    mode="2" if stem_count == 2 else "4",
                    quality=quality,
                )
                plan = route_intent(intent)
                _stems, models = execute_plan(plan, CLIP, out_dir)
            elif stem_count == 2:
                _stems, models = run_hybrid_2stem(
                    CLIP,
                    out_dir,
                    prefer_speed=prefer_speed,
                    model_tier="fast" if prefer_speed else "quality",
                )
            else:
                _stems, models = run_4stem_single_pass_or_hybrid(
                    CLIP,
                    out_dir,
                    prefer_speed=prefer_speed,
                )
            elapsed = time.monotonic() - t0
            rec.update(
                {
                    "elapsed_seconds": round(elapsed, 2),
                    "realtime_factor": round(elapsed / clip_dur, 4) if clip_dur else None,
                    "models_used": models,
                }
            )
            print(
                f"OK  {mode_name}  {rec['elapsed_seconds']}s  "
                f"RTF={rec['realtime_factor']}  {models}"
            )
        except Exception as exc:
            elapsed = time.monotonic() - t0
            rec.update({"elapsed_seconds": round(elapsed, 2), "error": str(exc)})
            print(f"FAIL {mode_name}  {exc}")
        records.append(rec)
    return records


def main() -> int:
    if not CLIP.is_file():
        print(f"Missing clip: {CLIP}", file=sys.stderr)
        return 1
    print(f"Clip: {CLIP} ({duration_s(CLIP):.1f}s)")
    print(f"STEM_MODELS_DIR={os.environ.get('STEM_MODELS_DIR', 'models')}")
    records = _run_matrix()
    out_json = OUT_ROOT / "pipeline_metrics.jsonl"
    with open(out_json, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")
    print(f"Wrote {out_json}")
    failed = sum(1 for r in records if "error" in r)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
