#!/usr/bin/env python3
from __future__ import annotations

"""End-to-end smoke script for the MIDI service.

Run manually during development. Assumes the FastAPI app is running locally
(default port 5002) and MIDI_SERVICE_API_TOKEN is set.
"""

import os
import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_WAV = REPO_ROOT / "midi_service" / "tests" / "fixtures" / "piano_c_major.wav"
POLL_INTERVAL_SEC = 1.0
POLL_TIMEOUT_SEC = 120


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

    styles = requests.get(f"{base_url}/rhythm/styles", headers=headers, timeout=10)
    styles.raise_for_status()
    print("Rhythm styles OK:", len(styles.json().get("styles", [])))

    if not FIXTURE_WAV.is_file():
        raise SystemExit(f"Fixture WAV missing: {FIXTURE_WAV}")

    with FIXTURE_WAV.open("rb") as wav_file:
        convert = requests.post(
            f"{base_url}/convert",
            headers=headers,
            files={"file": ("piano_c_major.wav", wav_file, "audio/wav")},
            timeout=30,
        )
    convert.raise_for_status()
    if convert.status_code != 202:
        raise SystemExit(f"Expected 202 from /convert, got {convert.status_code}")

    job_id = convert.json().get("job_id")
    if not job_id:
        raise SystemExit("Convert response missing job_id")

    print("Convert accepted:", job_id)

    deadline = time.time() + POLL_TIMEOUT_SEC
    status_body: dict = {}
    while time.time() < deadline:
        status = requests.get(
            f"{base_url}/status/{job_id}",
            headers=headers,
            timeout=10,
        )
        status.raise_for_status()
        status_body = status.json()
        state = status_body.get("status")
        print("Status:", state)
        if state == "completed":
            break
        if state in ("failed", "error", "cancelled"):
            raise SystemExit(f"Convert job failed: {status_body}")
        time.sleep(POLL_INTERVAL_SEC)
    else:
        raise SystemExit(f"Timed out waiting for job {job_id}")

    midi = requests.get(
        f"{base_url}/file/{job_id}/output.mid",
        headers=headers,
        timeout=30,
    )
    midi.raise_for_status()
    if not midi.content.startswith(b"MThd"):
        raise SystemExit("Output MIDI missing MThd header")

    print("Convert lifecycle OK:", job_id, f"({len(midi.content)} bytes)")


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as exc:
        print(f"Smoke check failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
