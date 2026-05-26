from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

ALLOWED_QUANTIZE_GRIDS = {"1/4", "1/8", "1/16", "1/32"}

DEFAULT_CONVERT_OPTIONS: dict[str, Any] = {
    "min_confidence": 0.5,
    "min_note_length_ms": 58,
    "include_pitch_bends": True,
    "quantize": False,
    "quantize_grid": "1/16",
    "quantize_bpm": 120,
    "quantize_strength": 1.0,
    "normalize_velocity": True,
    "target_velocity": 90,
    "max_note_length_ms": 0,
    "transpose": 0,
    "stem_job_id": None,
    "stem_name": None,
    "user_id": None,
}


def _parse_bool_option(name: str, raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    normalized = str(raw or "").strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise ValueError(f"{name} must be true or false")


def _parse_int_option(
    name: str,
    raw: Any,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    try:
        value = int(str("" if raw is None else raw).strip())
    except Exception as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    if maximum is not None and value > maximum:
        raise ValueError(f"{name} must be <= {maximum}")
    return value


def _parse_float_option(
    name: str,
    raw: Any,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    try:
        value = float(str("" if raw is None else raw).strip())
    except Exception as exc:
        raise ValueError(f"{name} must be a number") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    if maximum is not None and value > maximum:
        raise ValueError(f"{name} must be <= {maximum}")
    return value


def _parse_quantize_grid(raw: Any) -> str:
    grid = str(raw or "").strip()
    if grid not in ALLOWED_QUANTIZE_GRIDS:
        raise ValueError(
            "quantize_grid must be one of 1/4, 1/8, 1/16, or 1/32"
        )
    return grid


def parse_convert_form_options(raw: Mapping[str, Any] | None = None) -> dict[str, Any]:
    raw = raw or {}
    return {
        "min_confidence": _parse_float_option(
            "min_confidence",
            raw.get("min_confidence", DEFAULT_CONVERT_OPTIONS["min_confidence"]),
            minimum=0.05,
            maximum=0.95,
        ),
        "min_note_length_ms": _parse_int_option(
            "min_note_length_ms",
            raw.get(
                "min_note_length_ms",
                DEFAULT_CONVERT_OPTIONS["min_note_length_ms"],
            ),
            minimum=10,
            maximum=500,
        ),
        "include_pitch_bends": _parse_bool_option(
            "include_pitch_bends",
            raw.get(
                "include_pitch_bends",
                DEFAULT_CONVERT_OPTIONS["include_pitch_bends"],
            ),
        ),
        "quantize": _parse_bool_option(
            "quantize",
            raw.get("quantize", DEFAULT_CONVERT_OPTIONS["quantize"]),
        ),
        "quantize_grid": _parse_quantize_grid(
            raw.get("quantize_grid", DEFAULT_CONVERT_OPTIONS["quantize_grid"])
        ),
        "quantize_bpm": _parse_int_option(
            "quantize_bpm",
            raw.get("quantize_bpm", DEFAULT_CONVERT_OPTIONS["quantize_bpm"]),
            minimum=40,
            maximum=300,
        ),
        "quantize_strength": _parse_float_option(
            "quantize_strength",
            raw.get(
                "quantize_strength",
                DEFAULT_CONVERT_OPTIONS["quantize_strength"],
            ),
            minimum=0.0,
            maximum=1.0,
        ),
        "normalize_velocity": _parse_bool_option(
            "normalize_velocity",
            raw.get(
                "normalize_velocity",
                DEFAULT_CONVERT_OPTIONS["normalize_velocity"],
            ),
        ),
        "target_velocity": _parse_int_option(
            "target_velocity",
            raw.get("target_velocity", DEFAULT_CONVERT_OPTIONS["target_velocity"]),
            minimum=1,
            maximum=127,
        ),
        "max_note_length_ms": _parse_int_option(
            "max_note_length_ms",
            raw.get(
                "max_note_length_ms",
                DEFAULT_CONVERT_OPTIONS["max_note_length_ms"],
            ),
            minimum=0,
            maximum=60_000,
        ),
        "transpose": _parse_int_option(
            "transpose",
            raw.get("transpose", DEFAULT_CONVERT_OPTIONS["transpose"]),
            minimum=-48,
            maximum=48,
        ),
        "stem_job_id": raw.get("stem_job_id") or None,
        "stem_name": raw.get("stem_name") or None,
        "user_id": raw.get("user_id") or None,
    }


def options_from_job_item(item: Mapping[str, Any]) -> dict[str, Any]:
    """Extract pipeline options from a queue item with safe defaults."""
    return {
        key: item.get(key, default)
        for key, default in DEFAULT_CONVERT_OPTIONS.items()
    }


def build_enqueue_item(
    *,
    job_id: str,
    out_dir: Path,
    input_path: Path,
    options: Mapping[str, Any],
) -> dict[str, Any]:
    item = {
        "job_id": job_id,
        "out_dir": out_dir,
        "input_path": str(input_path),
    }
    item.update(options_from_job_item(options))
    return item
