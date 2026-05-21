"""Build pipeline options dict from a queued job item."""

from __future__ import annotations

from typing import Any


def _parse_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in ("true", "1", "yes")


def options_from_job_item(item: dict[str, Any]) -> dict[str, Any]:
    """Extract pipeline options from a queue item with safe defaults."""
    return {
        "min_confidence": float(item.get("min_confidence", 0.5)),
        "min_note_length_ms": int(item.get("min_note_length_ms", 58)),
        "include_pitch_bends": _parse_bool(item.get("include_pitch_bends"), True),
        "quantize": _parse_bool(item.get("quantize"), False),
        "quantize_grid": str(item.get("quantize_grid", "1/16")),
        "quantize_bpm": int(item.get("quantize_bpm", 120)),
        "normalize_velocity": _parse_bool(item.get("normalize_velocity"), True),
        "target_velocity": int(item.get("target_velocity", 90)),
        "max_note_length_ms": int(item.get("max_note_length_ms", 0)),
        "quantize_strength": float(item.get("quantize_strength", 1.0)),
        "transpose": int(item.get("transpose", 0)),
        "stem_job_id": item.get("stem_job_id"),
        "stem_name": item.get("stem_name"),
        "user_id": item.get("user_id"),
    }
