#!/usr/bin/env python3
print("Starting...")
import sys

sys.path.insert(0, "/mnt/d/burntbeats-aws")
print("Path inserted...")
from stem_service.config import STEM_BACKEND

print(f"STEM_BACKEND: {STEM_BACKEND}")
