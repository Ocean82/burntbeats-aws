#!/usr/bin/env python3
"""Quick check that hybrid pipeline modules import (run from repo root with venv)."""
from stem_service.hybrid import run_hybrid_2stem, run_hybrid_4stem
from stem_service.phase_inversion import create_perfect_instrumental
from stem_service.vocal_stage1 import extract_vocals_stage1
print("OK")
