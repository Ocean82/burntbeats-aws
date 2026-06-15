from __future__ import annotations

import json
import zipfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

from midi_service.export.model import ExportMode, ExportRequest, ExportSourceJob
from midi_service.midi_io import write_notes_to_midi
from midi_service.multi_track import merge_jobs_to_multitrack
from midi_service.routes.common import UUID_REGEX
from midi_service.services.storage import (
    METADATA_FILENAME,
    PROGRESS_FILENAME,
    safe_job_path,
    write_metadata,
    write_progress,
)


def _filter_notes_by_range(
    notes: list[dict[str, Any]],
    request: ExportRequest,
) -> list[dict[str, Any]]:
    if request.time_range != "custom":
        return notes
    start_s = float(request.range_start_s or 0)
    end_s = float(request.range_end_s or 0)
    filtered: list[dict[str, Any]] = []
    for note in notes:
        note_start = float(note.get("start", 0))
        note_end = note_start + float(note.get("duration", 0))
        if note_end <= start_s or note_start >= end_s:
            continue
        clipped = dict(note)
        clipped_start = max(note_start, start_s)
        clipped_end = min(note_end, end_s)
        clipped["start"] = round(clipped_start, 4)
        clipped["duration"] = round(max(clipped_end - clipped_start, 0.01), 4)
        filtered.append(clipped)
    return filtered


def run_export_sync(job_id: str, out_dir: Path, request: ExportRequest, output_dir: Path) -> None:
    write_progress(
        out_dir,
        {
            "status": "processing",
            "job_id": job_id,
            "progress": 15,
            "message": "Validating source jobs",
        },
    )

    source_notes = _load_source_notes(output_dir, request.source_jobs)
    selected_sources = [item for item in request.source_jobs if item.stem_name in request.selected_stems]

    write_progress(
        out_dir,
        {
            "status": "processing",
            "job_id": job_id,
            "progress": 55,
            "message": "Generating MIDI files",
        },
    )

    midi_type = 0 if request.format.value == "midi0" else 1
    generated_files: list[str] = []

    if request.mode == ExportMode.MIXDOWN:
        merge_jobs = []
        for source in selected_sources:
            notes = _filter_notes_by_range(source_notes[source.stem_name], request)
            merge_jobs.append(
                {
                    "stem_name": source.stem_name,
                    "notes": notes,
                    "program": -1,
                    "transpose": 0,
                    "is_drum": False,
                }
            )
        mixdown_name = "mixdown.mid"
        mixdown_path = out_dir / mixdown_name
        merge_jobs_to_multitrack(
            merge_jobs,
            mixdown_path,
            bpm=max(40, min(300, int(selected_sources[0].bpm if selected_sources else 120))),
        )
        if midi_type == 0:
            combined_notes: list[dict[str, Any]] = []
            for source in selected_sources:
                combined_notes.extend(
                    _filter_notes_by_range(source_notes[source.stem_name], request),
                )
            write_notes_to_midi(
                combined_notes,
                mixdown_path,
                bpm=max(40, min(300, int(selected_sources[0].bpm if selected_sources else 120))),
                instrument_name="Mixdown",
                midi_type=0,
            )
        generated_files.append(mixdown_name)
    else:
        for source in selected_sources:
            notes = _filter_notes_by_range(source_notes[source.stem_name], request)
            stem_filename = f"{_sanitize_name(source.stem_name)}.mid"
            stem_path = out_dir / stem_filename
            write_notes_to_midi(
                notes,
                stem_path,
                bpm=max(40, min(300, int(source.bpm))),
                instrument_name=source.stem_name,
                midi_type=midi_type,
            )
            generated_files.append(stem_filename)

    write_progress(
        out_dir,
        {
            "status": "processing",
            "job_id": job_id,
            "progress": 80,
            "message": "Packaging archive",
        },
    )

    archive_name = "stems.zip" if request.mode == ExportMode.STEMS else "mixdown.zip"
    archive_path = out_dir / archive_name
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for filename in generated_files:
            zf.write(out_dir / filename, arcname=filename)

    metadata: dict[str, Any] = {
        "job_id": job_id,
        "type": "export",
        "mode": request.mode.value,
        "format": request.format.value,
        "time_range": request.time_range,
        "range_start_s": request.range_start_s,
        "range_end_s": request.range_end_s,
        "title": request.title,
        "artist": request.artist,
        "genre": request.genre,
        "selected_stems": request.selected_stems,
        "source_jobs": [asdict(source) for source in request.source_jobs],
        "files": [archive_name, *generated_files],
        "archive": archive_name,
    }
    write_metadata(out_dir, metadata)

    write_progress(
        out_dir,
        {
            "status": "completed",
            "job_id": job_id,
            "progress": 100,
            "result": {
                "archive": archive_name,
                "files": generated_files,
                "selected_stems": request.selected_stems,
                "mode": request.mode.value,
            },
        },
    )


def _load_source_notes(output_dir: Path, sources: list[ExportSourceJob]) -> dict[str, list[dict[str, Any]]]:
    notes_by_stem: dict[str, list[dict[str, Any]]] = {}
    for source in sources:
        if not UUID_REGEX.match(source.job_id):
            raise ValueError(f"Invalid source job_id: {source.job_id}")

        progress_path = safe_job_path(output_dir, source.job_id, PROGRESS_FILENAME)
        if not progress_path.is_file():
            raise ValueError(f"Source job not found: {source.job_id}")

        try:
            payload = json.loads(progress_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Corrupted source progress for job: {source.job_id}") from exc

        if payload.get("status") != "completed":
            raise ValueError(f"Source job not completed: {source.job_id}")

        notes = payload.get("result", {}).get("piano_roll_notes")
        if not isinstance(notes, list) or not notes:
            raise ValueError(f"Source job has no note data: {source.job_id}")
        notes_by_stem[source.stem_name] = notes
    return notes_by_stem


def _sanitize_name(stem_name: str) -> str:
    filtered = "".join(ch if (ch.isalnum() or ch in {"-", "_"}) else "_" for ch in stem_name)
    sanitized = filtered.strip("._")
    return sanitized or "stem"
