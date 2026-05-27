from __future__ import annotations

"""End-to-end smoke script for the MIDI service.

This is intentionally minimal and is meant to be run manually during
development. It assumes the FastAPI app is running locally and that a
valid API token is available in the MIDI_SERVICE_API_TOKEN environment
variable.
"""

import os
from pathlib import Path

import requests


def main() -> None:
    base_url = os.environ.get("MIDI_SERVICE_BASE_URL", "http://localhost:8000")
    token = os.environ.get("MIDI_SERVICE_API_TOKEN", "")
    if not token:
        raise SystemExit("MIDI_SERVICE_API_TOKEN is required for smoke script")

    headers = {"x-api-token": token}

    # Simple health check by hitting /ops/queue.
    r = requests.get(f"{base_url}/ops/queue", headers=headers, timeout=10)
    r.raise_for_status()
    print("Queue endpoint OK:", r.json())


if __name__ == "__main__":
    main()

