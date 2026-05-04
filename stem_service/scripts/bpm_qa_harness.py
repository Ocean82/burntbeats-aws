from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Iterable

from stem_service.bpm_analysis import estimate_bpm

SUPPORTED_AUDIO_EXTS = {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aac"}


def iter_audio_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_AUDIO_EXTS:
            yield path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run BPM QA analysis over a folder and emit CSV results."
    )
    parser.add_argument(
        "--input-dir",
        required=True,
        type=Path,
        help="Directory containing audio files to evaluate.",
    )
    parser.add_argument(
        "--out-csv",
        required=True,
        type=Path,
        help="Output CSV file path.",
    )
    parser.add_argument(
        "--show-progress",
        action="store_true",
        help="Print progress logs while processing files.",
    )
    args = parser.parse_args()

    input_dir: Path = args.input_dir
    out_csv: Path = args.out_csv
    show_progress: bool = bool(args.show_progress)

    if not input_dir.exists() or not input_dir.is_dir():
        raise SystemExit(f"--input-dir must be an existing directory: {input_dir}")

    files = sorted(iter_audio_files(input_dir))
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    with out_csv.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.DictWriter(
            fp,
            fieldnames=[
                "filename",
                "relative_path",
                "bpm",
                "beat_offset_seconds",
                "confidence",
                "implementation_path",
            ],
        )
        writer.writeheader()

        total = len(files)
        for idx, file_path in enumerate(files, start=1):
            meta = estimate_bpm(file_path)
            if meta is None:
                row = {
                    "filename": file_path.name,
                    "relative_path": str(file_path.relative_to(input_dir)),
                    "bpm": "",
                    "beat_offset_seconds": "",
                    "confidence": "",
                    "implementation_path": "failed",
                }
            else:
                row = {
                    "filename": file_path.name,
                    "relative_path": str(file_path.relative_to(input_dir)),
                    "bpm": meta.get("bpm", ""),
                    "beat_offset_seconds": meta.get("beat_offset_seconds", ""),
                    "confidence": meta.get("confidence", ""),
                    "implementation_path": "estimate_bpm",
                }
            writer.writerow(row)

            if show_progress:
                print(f"[{idx}/{total}] {file_path.name} -> bpm={row['bpm']} conf={row['confidence']}")

    print(f"Wrote BPM QA report to: {out_csv}")
    print(f"Processed files: {len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
