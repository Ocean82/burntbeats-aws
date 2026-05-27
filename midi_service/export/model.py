"""Export-related models for mixdown and stems."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal


class ExportMode(str, Enum):
    MIXDOWN = "mixdown"
    STEMS = "stems"


class ExportFormat(str, Enum):
    MIDI_TYPE0 = "midi0"
    MIDI_TYPE1 = "midi1"


@dataclass
class ExportRequest:
    mode: ExportMode
    selected_stems: list[str]
    format: ExportFormat = ExportFormat.MIDI_TYPE1
    title: str | None = None
    artist: str | None = None
    genre: str | None = None
    time_range: Literal["full_project", "custom"] = "full_project"

