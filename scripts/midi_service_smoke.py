#!/usr/bin/env python3
from __future__ import annotations

"""End-to-end smoke script for the MIDI service.

Run manually during development. Assumes the FastAPI app is running locally
(default port 5002) and MIDI_SERVICE_API_TOKEN is set.
"""

import os
import sys

import requests


def main() -> None:
    base_url = os.environ.get("MIDI_SERVICE_BASE_URL", "http://127.0.0.1:5002")
    token = os.environ.get("MIDI_SERVICE_API_TOKEN", "")
    if not token:
        raise SystemExit("MIDI_SERVICE_API_TOKEN is required for smoke script")

    headers = {"X-Midi-Service-Token": token}

    r = requests.get(f"{base_url}/health", headers=headers, timeout=10)
    r.raise_for_status()
    body = r.json()
    print("Health OK:", body.get("status", body))

    queue = requests.get(f"{base_url}/ops/queue", headers=headers, timeout=10)
    queue.raise_for_status()
    print("Queue endpoint OK:", queue.json())


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as exc:
        print(f"Smoke check failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
