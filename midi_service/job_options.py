"""Build pipeline options dict from a queued job item."""

from __future__ import annotations

from typing import Any

from midi_service.services.options import options_from_job_item as _options_from_job_item


def options_from_job_item(item: dict[str, Any]) -> dict[str, Any]:
    """Extract pipeline options from a queue item with safe defaults."""
    return _options_from_job_item(item)
