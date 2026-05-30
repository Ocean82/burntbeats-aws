"""Canonical stem target identifiers for intent-based routing."""

from __future__ import annotations

# User-facing / API targets
EXTRACT_TARGETS = frozenset(
    {
        "vocals",
        "drums",
        "bass",
        "guitar",
        "other",
        "instrumental",
    }
)

# Full separation outputs
FULL_SEPARATION_2 = ("vocals", "instrumental")
FULL_SEPARATION_4 = ("vocals", "drums", "bass", "other")

# MUSDB stems produced by Demucs 4-stem fallback
DEMUCS_4_STEMS = frozenset({"vocals", "drums", "bass", "other"})


def normalize_target(stem_id: str) -> str:
    """Normalize API target id (lowercase, strip)."""
    return stem_id.strip().lower()


def delivery_stem_id(target: str) -> str:
    """Filesystem stem id for a requested target (guitar may map to other until dedicated model)."""
    t = normalize_target(target)
    if t == "guitar":
        return "guitar"
    return t


def fallback_demucs_stem(target: str) -> str:
    """Stem id to read from Demucs 4-stem output for a target."""
    t = normalize_target(target)
    if t == "guitar":
        return "other"
    return t
