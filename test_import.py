#!/usr/bin/env python3
"""Quick test script to verify stem_service can start."""

import sys

sys.path.insert(0, "/mnt/d/burntbeats-aws")

from stem_service.config import STEM_BACKEND, htdemucs_available
from stem_service.server import app

print(f"STEM_BACKEND: {STEM_BACKEND}")
print(f"htdemucs available: {htdemucs_available()}")
print(f"App routes: {len(app.routes)}")
print("All imports successful!")
