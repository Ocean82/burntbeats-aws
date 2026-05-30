"""Parse and validate intent-driven split requests."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

from stem_service.routing.targets import (
    EXTRACT_TARGETS,
    FULL_SEPARATION_2,
    FULL_SEPARATION_4,
    normalize_target,
)

SplitTask = Literal["extract", "remove", "full_separation"]
QualityIntent = Literal["fast", "high"]
QualityMode = Literal["speed", "quality"]


@dataclass(frozen=True)
class SplitIntent:
    task: SplitTask
    targets: tuple[str, ...] = ()
    mode: Literal["2", "4"] | None = None
    quality: QualityIntent = "high"

    def quality_mode(self) -> QualityMode:
        return "speed" if self.quality == "fast" else "quality"

    def prefer_speed(self) -> bool:
        return self.quality == "fast"

    def legacy_stem_count(self) -> int:
        if self.task == "full_separation":
            return 2 if self.mode == "2" else 4
        return len(self.output_stem_ids())

    def output_stem_ids(self) -> tuple[str, ...]:
        if self.task == "full_separation":
            return FULL_SEPARATION_2 if self.mode == "2" else FULL_SEPARATION_4
        if self.task == "remove":
            # remove vocals → deliver instrumental (karaoke)
            return tuple(
                "instrumental" if normalize_target(t) == "vocals" else normalize_target(t)
                for t in self.targets
            )
        return tuple(normalize_target(t) for t in self.targets)

    def to_json_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "task": self.task,
            "quality": self.quality,
        }
        if self.targets:
            out["targets"] = list(self.targets)
        if self.mode is not None:
            out["mode"] = self.mode
        return out


def quality_intent_from_mode(quality_mode: str) -> QualityIntent:
    return "fast" if quality_mode == "speed" else "high"


def intent_from_legacy(stems: int, quality_mode: str) -> SplitIntent:
    """Map legacy stems=2|4 API to full_separation intent."""
    return SplitIntent(
        task="full_separation",
        mode="2" if stems == 2 else "4",
        quality=quality_intent_from_mode(quality_mode),
    )


def parse_intent_json(raw: str) -> SplitIntent:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid intent JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("intent must be a JSON object")
    return parse_intent_dict(data)


def parse_intent_dict(data: dict[str, Any]) -> SplitIntent:
    task = data.get("task")
    if task not in ("extract", "remove", "full_separation"):
        raise ValueError("task must be extract, remove, or full_separation")

    quality_raw = (data.get("quality") or "high").strip().lower()
    if quality_raw in ("fast", "speed"):
        quality: QualityIntent = "fast"
    elif quality_raw in ("high", "quality"):
        quality = "high"
    else:
        raise ValueError("quality must be fast or high")

    targets_raw = data.get("targets") or []
    if not isinstance(targets_raw, list):
        raise ValueError("targets must be a list")
    targets = tuple(normalize_target(str(t)) for t in targets_raw)

    mode_raw = data.get("mode")
    mode: Literal["2", "4"] | None = None
    if mode_raw is not None:
        mode_str = str(mode_raw).strip()
        if mode_str not in ("2", "4"):
            raise ValueError("mode must be 2 or 4")
        mode = mode_str  # type: ignore[assignment]

    if task == "full_separation":
        if not mode:
            mode = "4"
        if targets:
            raise ValueError("targets must be omitted for full_separation")
        return SplitIntent(task=task, mode=mode, quality=quality)

    if task == "remove":
        if not targets:
            raise ValueError("remove requires targets")
        for t in targets:
            if t != "vocals":
                raise ValueError("remove currently supports vocals only")
        return SplitIntent(task=task, targets=targets, quality=quality)

    # extract
    if not targets:
        raise ValueError("extract requires at least one target")
    for t in targets:
        if t not in EXTRACT_TARGETS:
            raise ValueError(f"unknown target: {t}")
    return SplitIntent(task=task, targets=targets, quality=quality)


def parse_intent_form(
    *,
    intent_json: str | None = None,
    task: str | None = None,
    targets_csv: str | None = None,
    mode: str | None = None,
    quality: str | None = None,
) -> SplitIntent | None:
    """Parse intent from multipart fields; None if no intent fields provided."""
    if intent_json and intent_json.strip():
        return parse_intent_json(intent_json.strip())

    if not task or not str(task).strip():
        return None

    data: dict[str, Any] = {"task": task.strip().lower()}
    if targets_csv and targets_csv.strip():
        data["targets"] = [
            t.strip() for t in targets_csv.split(",") if t.strip()
        ]
    if mode and str(mode).strip():
        data["mode"] = str(mode).strip()
    if quality and str(quality).strip():
        data["quality"] = str(quality).strip().lower()
    return parse_intent_dict(data)
