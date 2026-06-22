"""User-facing progress stage labels for intent-driven split jobs."""

from __future__ import annotations

from typing import Any

_JOB_KIND_LABELS: dict[str, str] = {
    "vocals_only": "Extracting vocals",
    "karaoke": "Removing vocals",
    "hybrid_2": "Separating stems",
    "hybrid_4": "Full separation",
    "mdx_stem": "Extracting",
    "parallel_mdx": "Extracting",
    "demucs_4_fallback": "Extracting stems",
}


def _format_targets(targets: list[str]) -> str:
    if not targets:
        return "stems"
    if len(targets) == 1:
        return targets[0]
    if len(targets) == 2:
        return f"{targets[0]} and {targets[1]}"
    return ", ".join(targets[:-1]) + f", and {targets[-1]}"


def intent_queued_label(intent: dict[str, Any]) -> str | None:
    task = intent.get("task")
    if task == "full_separation":
        mode = intent.get("mode") or "4"
        return (
            f"Waiting for full separation ({mode} stems)…"
            if mode == "4"
            else "Waiting for 2-stem separation…"
        )
    if task == "remove":
        return "Waiting to remove vocals…"
    targets = intent.get("targets") or []
    if task == "extract" and targets:
        return f"Waiting to extract {_format_targets([str(t) for t in targets])}…"
    return None


def intent_running_stage(
    intent: dict[str, Any],
    progress: int,
    *,
    active_job_kind: str | None = None,
) -> tuple[str, str]:
    """Map progress percent + active pipeline job to stage code and label."""
    if progress < 5:
        return ("starting", "Preparing job…")
    if progress >= 96:
        return ("finalizing_stems", "Finalising stems…")

    task = intent.get("task")
    targets = [str(t) for t in (intent.get("targets") or [])]
    kind = active_job_kind or ""

    if task == "full_separation":
        mode = intent.get("mode", "4")
        quality = intent.get("quality", "high")
        is_speed = quality == "fast"
        if mode == "2":
            if progress < 90:
                return ("separating_vocals", "Separating vocals…")
            if progress < 95:
                return ("building_instrumental", "Building instrumental…")
            return ("finalizing_stems", "Finalising stems…")
        # 4-stem mode
        if is_speed:
            if progress < 80:
                return ("separating_vocals", "Separating vocals…")
            if progress < 86:
                return ("building_instrumental", "Building accompaniment…")
        else:
            if progress < 88:
                return ("separating_vocals", "Separating vocals…")
            if progress < 92:
                return ("building_instrumental", "Building accompaniment…")
        return ("splitting_accompaniment", "Splitting drums, bass & other…")

    if task == "remove" or kind == "karaoke":
        if progress < 88:
            return ("separating_vocals", "Separating vocals…")
        return ("building_instrumental", "Building instrumental (karaoke)…")

    if kind == "vocals_only" or (task == "extract" and targets == ["vocals"]):
        return ("extracting_vocals", "Extracting vocals…")

    if kind in ("mdx_stem", "parallel_mdx"):
        phrase = _format_targets(targets) if targets else "stems"
        return ("extracting_target", f"Extracting {phrase}…")

    if kind == "demucs_4_fallback":
        phrase = _format_targets(targets) if targets else "stems"
        if progress < 80:
            return ("separating_vocals", "Separating vocals…")
        if progress < 90:
            return ("building_instrumental", "Building accompaniment…")
        return ("extracting_target", f"Extracting {phrase}…")

    if task == "extract" and targets:
        return ("extracting_target", f"Extracting {_format_targets(targets)}…")

    base = _JOB_KIND_LABELS.get(kind, "Processing")
    return ("processing", f"{base}…")


def should_use_intent_stages(intent: dict[str, Any] | None) -> bool:
    if not intent:
        return False
    return intent.get("task") in ("full_separation", "extract", "remove")
