#!/usr/bin/env python3
"""Simple stem service health check."""

import requests
import sys

try:
    resp = requests.get("http://127.0.0.1:5000/health", timeout=5)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.json()}")
    sys.exit(0)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
