"""
Shared utilities for the hybrid pipeline.

Contains helpers used by multiple pipeline strategies:
- _materialize_stage1_instrumental: copy or phase-invert based on InstrumentalSource
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

import numpy as np
import soundfile as sf

from stem_service.phase_inversion import create_perfect_instrumental
from stem_service.vocal_stage1 import InstrumentalSource

logger = logging.getLogger(__name__)


def _materialize_stage1_instrumental(
    mix_path: Path,
    vocals_path: Path,
    stage1_instrumental: Path | None,
    inst_src: InstrumentalSource,
    dest_instrumental: Path,
) -> None:
    """
    Copy Stage-1 instrumental when already final, or run phase inversion when pending.
    Enforces invariants so ``None`` is never ambiguous.
    """
    if inst_src.needs_hybrid_phase_inversion():
        if stage1_instrumental is not None:
            raise ValueError(
                "Stage 1 invariant: PHASE_INVERSION_PENDING but instrumental path is set"
            )
        create_perfect_instrumental(mix_path, vocals_path, dest_instrumental)
        return
    if stage1_instrumental is None:
        raise ValueError(
            f"Stage 1 invariant: instrumental_source={inst_src.value!r} requires a path"
        )
    shutil.copy2(stage1_instrumental, dest_instrumental)

