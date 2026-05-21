"""
Pytest configuration and shared fixtures for midi_service tests.

Fixtures provide:
- An async httpx client wired to the FastAPI app (with model/worker mocked)
- Paths to test fixture files
- A temporary output directory for job artifacts
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Register custom markers
def pytest_configure(config):
    config.addinivalue_line("markers", "integration: marks tests requiring Basic Pitch installed")


@pytest.fixture(scope="session", autouse=True)
def generate_wav_fixture():
    """Ensure the piano_c_major.wav fixture exists before tests run."""
    wav_path = FIXTURES_DIR / "piano_c_major.wav"
    if not wav_path.exists():
        from midi_service.tests.generate_fixtures import generate_piano_c_major

        generate_piano_c_major()
    assert wav_path.exists(), f"Fixture not found: {wav_path}"


@pytest.fixture
def piano_wav_path() -> Path:
    """Path to the piano C major scale WAV fixture."""
    return FIXTURES_DIR / "piano_c_major.wav"


@pytest.fixture
def invalid_file_path() -> Path:
    """Path to the invalid (non-audio) text file fixture."""
    return FIXTURES_DIR / "invalid.txt"


@pytest.fixture
def tmp_output_dir(tmp_path):
    """Temporary output directory for MIDI job artifacts."""
    return tmp_path / "midi_output"


def _make_fake_progress(out_dir: Path, job_id: str) -> None:
    """Write a fake completed progress.json with realistic data."""
    out_dir.mkdir(parents=True, exist_ok=True)
    progress = {
        "status": "completed",
        "job_id": job_id,
        "progress": 100,
        "message": "Conversion complete",
        "result": {
            "notes_detected": 5,
            "duration_seconds": 5.0,
            "tracks": 1,
            "inference_time_seconds": 1.2,
            "piano_roll_notes": [
                {"pitch": 60, "start": 0.0, "duration": 1.0, "velocity": 90},
                {"pitch": 62, "start": 1.0, "duration": 1.0, "velocity": 88},
                {"pitch": 64, "start": 2.0, "duration": 1.0, "velocity": 85},
                {"pitch": 65, "start": 3.0, "duration": 1.0, "velocity": 87},
                {"pitch": 67, "start": 4.0, "duration": 1.0, "velocity": 91},
            ],
            "analysis": {
                "estimated_key": "C major",
                "scale": "major",
                "pitch_range": {
                    "min": 60,
                    "max": 67,
                    "min_name": "C4",
                    "max_name": "G4",
                },
                "note_density": 1.0,
                "suggested_bpm": 120,
                "complexity_score": 0.25,
                "total_notes": 5,
            },
            "post_process": {
                "notes_before": 5,
                "notes_after": 5,
                "velocity_normalized": True,
            },
        },
    }
    (out_dir / "progress.json").write_text(json.dumps(progress), encoding="utf-8")

    # Write a minimal valid MIDI file (MThd header + minimal track)
    midi_bytes = (
        b"MThd"  # Header chunk type
        b"\x00\x00\x00\x06"  # Header length (6 bytes)
        b"\x00\x00"  # Format type 0
        b"\x00\x01"  # Number of tracks
        b"\x00\x60"  # Ticks per quarter note (96)
        b"MTrk"  # Track chunk type
        b"\x00\x00\x00\x04"  # Track length (4 bytes)
        b"\x00\xff\x2f\x00"  # End of track event
    )
    (out_dir / "output.mid").write_bytes(midi_bytes)


@pytest_asyncio.fixture
async def client(tmp_path):
    """
    Async httpx client connected to the FastAPI app with mocked model/worker.

    The preload_model and worker are mocked so tests don't require Basic Pitch
    to be installed or the model to be downloaded. The enqueue_job is replaced
    to directly execute the fake conversion (bypassing the async worker loop).
    """
    output_dir = tmp_path / "midi_output"
    output_dir.mkdir(parents=True, exist_ok=True)

    def fake_run_job(job_id, input_path, out_dir, options):
        _make_fake_progress(out_dir, job_id)

    async def fake_start_worker(run_fn):
        pass

    async def fake_stop_worker():
        pass

    async def fake_enqueue(item):
        """Directly run the fake conversion instead of queuing."""
        job_id = item["job_id"]
        out_dir = item["out_dir"]
        input_path = Path(item["input_path"])
        options = {
            "min_confidence": item.get("min_confidence", 0.5),
            "min_note_length_ms": item.get("min_note_length_ms", 58),
            "include_pitch_bends": item.get("include_pitch_bends", True),
        }
        fake_run_job(job_id, input_path, out_dir, options)

    with (
        patch("midi_service.config.MIDI_OUTPUT_DIR", output_dir),
        patch("midi_service.server.MIDI_OUTPUT_DIR", output_dir),
        patch("midi_service.job_utils.MIDI_OUTPUT_DIR", output_dir),
        patch("midi_service.server.preload_model"),
        patch("midi_service.server.start_worker", side_effect=fake_start_worker),
        patch("midi_service.server.stop_worker", side_effect=fake_stop_worker),
        patch("midi_service.server.enqueue_job", side_effect=fake_enqueue),
        patch("midi_service.server.get_queue_depth", return_value=0),
    ):
        from midi_service.server import app

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as ac:
            yield ac


@pytest_asyncio.fixture
async def integration_client(tmp_path):
    """
    Async httpx client for full integration tests (requires Basic Pitch installed).

    This client does NOT mock the pipeline — it runs real inference.
    Use with @pytest.mark.integration tests only.
    """
    output_dir = tmp_path / "midi_output"
    output_dir.mkdir(parents=True, exist_ok=True)

    with (
        patch("midi_service.config.MIDI_OUTPUT_DIR", output_dir),
        patch("midi_service.server.MIDI_OUTPUT_DIR", output_dir),
        patch("midi_service.job_utils.MIDI_OUTPUT_DIR", output_dir),
    ):
        from midi_service.server import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
