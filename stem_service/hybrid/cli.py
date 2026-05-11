"""
CLI entry point for hybrid stem separation.

Commands:
  stage1 — Extract vocals only (for Rust orchestration)
  stage2 — Demucs 4-stem on instrumental
  full   — Full hybrid pipeline (input → stems)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from stem_service.hybrid.expand import _stage1_only, _stage2_only
from stem_service.hybrid.pipeline_2stem import run_hybrid_2stem
from stem_service.hybrid.pipeline_4stem import run_hybrid_4stem


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
