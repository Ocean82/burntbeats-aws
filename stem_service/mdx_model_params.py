"""
Optional loaders for UVR-style ``model_data.json`` (hash-keyed metadata).

Runtime MDX inference does **not** depend on these files: authoritative numeric
settings are ``_MDX_CONFIGS`` in ``mdx_onnx.py``. Use this module for tooling,
audits, or comparing a local UVR export to the built-in table.

See ``docs/MODEL-PARAMS.md`` for field meanings and the runtime vs JSON mapping.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from stem_service.config import MODELS_DIR

logger = logging.getLogger(__name__)

# Candidate locations (first existing files are merged in order; later overwrites same hash key).
UVR_MODEL_DATA_JSON_PATHS: tuple[Path, ...] = (
    MODELS_DIR / "MDX_Net_Models" / "model_data" / "model_data.json",
    MODELS_DIR / "mdxnet_models" / "model_data.json",
)


def existing_uvr_model_data_paths() -> list[Path]:
    """Return paths under ``MODELS_DIR`` that exist on disk."""
    return [p for p in UVR_MODEL_DATA_JSON_PATHS if p.is_file()]


def load_uvr_model_data_merged() -> dict[str, Any]:
    """
    Load and merge all found ``model_data.json`` blobs into one dict (hash → fields).

    Returns an empty dict if no file exists (models dir missing or not shipped).
    """
    out: dict[str, Any] = {}
    for path in existing_uvr_model_data_paths():
        try:
            with path.open(encoding="utf-8") as f:
                blob = json.load(f)
        except OSError as e:
            logger.debug("Could not read %s: %s", path, e)
            continue
        if not isinstance(blob, dict):
            continue
        for k, v in blob.items():
            if isinstance(k, str) and isinstance(v, dict):
                out[k] = v
    return out
