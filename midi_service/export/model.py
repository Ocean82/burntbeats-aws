"""Export-related models and validators."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Literal


MAX_EXPORT_STEMS = 10


class ExportMode(str, Enum):
    MIXDOWN = "mixdown"
    STEMS = "stems"


class ExportFormat(str, Enum):
    MIDI_TYPE0 = "midi0"
    MIDI_TYPE1 = "midi1"


@dataclass(frozen=True)
class ExportSourceJob:
    job_id: str
    stem_name: str
    bpm: int = 120


@dataclass(frozen=True)
class ExportRequest:
    mode: ExportMode
    selected_stems: list[str]
    source_jobs: list[ExportSourceJob]
    format: ExportFormat = ExportFormat.MIDI_TYPE1
    title: str | None = None
    artist: str | None = None
    genre: str | None = None
    time_range: Literal["full_project", "custom"] = "full_project"


def parse_export_request(raw: dict[str, Any]) -> ExportRequest:
    if not isinstance(raw, dict):
        raise ValueError("Request body must be a JSON object")

    try:
        mode = ExportMode(raw.get("mode", ExportMode.STEMS.value))
    except Exception as exc:
        raise ValueError("mode must be one of: stems, mixdown") from exc

    try:
        export_format = ExportFormat(raw.get("format", ExportFormat.MIDI_TYPE1.value))
    except Exception as exc:
        raise ValueError("format must be one of: midi0, midi1") from exc

    time_range = str(raw.get("time_range", "full_project"))
    if time_range not in {"full_project", "custom"}:
        raise ValueError("time_range must be full_project or custom")

    selected_raw = raw.get("selected_stems")
    if not isinstance(selected_raw, list) or not selected_raw:
        raise ValueError("selected_stems must be a non-empty array")

    selected_stems: list[str] = []
    for value in selected_raw:
        stem = str(value or "").strip()
        if not stem:
            raise ValueError("selected_stems contains an empty value")
        if stem in selected_stems:
            raise ValueError(f"selected_stems contains duplicate stem: {stem}")
        selected_stems.append(stem)

    if len(selected_stems) > MAX_EXPORT_STEMS:
        raise ValueError(f"selected_stems exceeds maximum of {MAX_EXPORT_STEMS}")

    source_jobs_raw = raw.get("source_jobs")
    if not isinstance(source_jobs_raw, list) or not source_jobs_raw:
        raise ValueError("source_jobs must be a non-empty array")

    source_jobs: list[ExportSourceJob] = []
    source_stem_names: set[str] = set()
    for entry in source_jobs_raw:
        if not isinstance(entry, dict):
            raise ValueError("source_jobs must contain objects")
        job_id = str(entry.get("job_id") or "").strip()
        stem_name = str(entry.get("stem_name") or "").strip()
        if not job_id:
            raise ValueError("source_jobs entries require job_id")
        if not stem_name:
            raise ValueError("source_jobs entries require stem_name")
        if stem_name in source_stem_names:
            raise ValueError(f"source_jobs contains duplicate stem_name: {stem_name}")
        source_stem_names.add(stem_name)
        try:
            bpm = int(entry.get("bpm", 120))
        except Exception as exc:
            raise ValueError(f"source_jobs[{stem_name}] bpm must be an integer") from exc
        source_jobs.append(ExportSourceJob(job_id=job_id, stem_name=stem_name, bpm=bpm))

    for stem in selected_stems:
        if stem not in source_stem_names:
            raise ValueError(f"selected_stem not present in source_jobs: {stem}")

    return ExportRequest(
        mode=mode,
        selected_stems=selected_stems,
        source_jobs=source_jobs,
        format=export_format,
        title=_normalize_text(raw.get("title")),
        artist=_normalize_text(raw.get("artist")),
        genre=_normalize_text(raw.get("genre")),
        time_range=time_range,
    )


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None

