"""
Integration tests for the MIDI conversion service.

Tests cover:
- Full conversion lifecycle (submit → poll → download)
- Error handling (invalid file → 400)
- Health endpoint

Tests marked with @pytest.mark.integration require Basic Pitch installed
and run real inference. All other tests use mocked pipeline.

Run unit tests (mocked):
    pytest midi_service/tests/test_integration.py -v

Run integration tests (requires Basic Pitch):
    pytest midi_service/tests/test_integration.py -v -m integration
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Task 7.2 + 7.3: Submit fixture, poll until completed, verify result
# ---------------------------------------------------------------------------


class TestConversionLifecycle:
    """Test the full conversion lifecycle with mocked pipeline."""

    async def test_submit_and_poll_until_completed(self, client, piano_wav_path: Path):
        """Submit a WAV file, poll status until completed, verify result fields."""
        # POST /convert with the piano fixture
        with open(piano_wav_path, "rb") as f:
            response = await client.post(
                "/convert",
                files={"file": ("piano_c_major.wav", f, "audio/wav")},
                data={
                    "min_confidence": "0.5",
                    "min_note_length_ms": "58",
                    "include_pitch_bends": "true",
                },
            )

        assert response.status_code == 202
        body = response.json()
        assert "job_id" in body
        assert body["status"] == "queued"

        job_id = body["job_id"]

        # Poll /status/{job_id} until completed (with timeout)
        max_polls = 20
        poll_interval = 0.2
        final_status = None

        for _ in range(max_polls):
            await asyncio.sleep(poll_interval)
            status_resp = await client.get(f"/status/{job_id}")
            assert status_resp.status_code == 200
            status_data = status_resp.json()

            if status_data["status"] in ("completed", "failed"):
                final_status = status_data
                break

        assert final_status is not None, "Job did not complete within polling timeout"
        assert final_status["status"] == "completed"

        # Task 7.3: Verify notes_detected > 0 and piano_roll_notes is non-empty
        result = final_status["result"]
        assert result["notes_detected"] > 0
        assert isinstance(result["piano_roll_notes"], list)
        assert len(result["piano_roll_notes"]) > 0

        # Verify note structure
        note = result["piano_roll_notes"][0]
        assert "pitch" in note
        assert "start" in note
        assert "duration" in note
        assert "velocity" in note

    async def test_result_contains_expected_metadata(self, client, piano_wav_path: Path):
        """Verify the completed result contains all expected metadata fields."""
        with open(piano_wav_path, "rb") as f:
            response = await client.post(
                "/convert",
                files={"file": ("piano_c_major.wav", f, "audio/wav")},
            )

        job_id = response.json()["job_id"]

        # Poll until done
        for _ in range(20):
            await asyncio.sleep(0.2)
            status_resp = await client.get(f"/status/{job_id}")
            data = status_resp.json()
            if data["status"] == "completed":
                break

        result = data["result"]
        assert "notes_detected" in result
        assert "duration_seconds" in result
        assert "tracks" in result
        assert "inference_time_seconds" in result
        assert "piano_roll_notes" in result
        assert "analysis" in result
        assert result["analysis"]["estimated_key"]


# ---------------------------------------------------------------------------
# Task 7.4: Verify GET /file/{job_id}/output.mid returns valid MIDI (MThd)
# ---------------------------------------------------------------------------


class TestMidiFileDownload:
    """Test MIDI file download endpoint."""

    async def test_download_midi_has_mthd_header(self, client, piano_wav_path: Path):
        """After conversion completes, the MIDI file should have a valid MThd header."""
        # Submit and wait for completion
        with open(piano_wav_path, "rb") as f:
            response = await client.post(
                "/convert",
                files={"file": ("piano_c_major.wav", f, "audio/wav")},
            )

        job_id = response.json()["job_id"]

        for _ in range(20):
            await asyncio.sleep(0.2)
            status_resp = await client.get(f"/status/{job_id}")
            if status_resp.json()["status"] == "completed":
                break

        # GET /file/{job_id}/output.mid
        file_resp = await client.get(f"/file/{job_id}/output.mid")
        assert file_resp.status_code == 200

        # Verify MThd header (first 4 bytes of any valid MIDI file)
        content = file_resp.content
        assert content[:4] == b"MThd", f"Expected MThd header, got: {content[:4]!r}"

    async def test_download_before_completion_returns_404(self, client):
        """Requesting a file for a non-existent job returns 404."""
        response = await client.get("/file/00000000-0000-0000-0000-000000000000/output.mid")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Task 7.5: Error case — submit invalid file, verify 400
# ---------------------------------------------------------------------------


class TestErrorCases:
    """Test error handling for invalid inputs."""

    async def test_invalid_file_returns_400(self, client, invalid_file_path: Path):
        """Submitting a non-audio file should return 400."""
        with open(invalid_file_path, "rb") as f:
            response = await client.post(
                "/convert",
                files={"file": ("invalid.txt", f, "text/plain")},
            )

        assert response.status_code == 400
        body = response.json()
        assert "detail" in body

    async def test_invalid_job_id_format_returns_400(self, client):
        """A malformed job_id should return 400."""
        response = await client.get("/status/not-a-valid-uuid")
        assert response.status_code == 400

    async def test_unknown_filename_returns_400(self, client):
        """Requesting an unknown filename returns 400."""
        response = await client.get(
            "/file/00000000-0000-0000-0000-000000000000/unknown.txt"
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Task 7.6: Health endpoint test
# ---------------------------------------------------------------------------


class TestHealthEndpoint:
    """Test the /health endpoint."""

    async def test_health_returns_status_and_version(self, client):
        """Health endpoint should return status and basic_pitch_version."""
        # Patch basic_pitch module for the health endpoint
        import sys
        from unittest.mock import MagicMock

        mock_bp = MagicMock()
        mock_bp.__version__ = "0.3.0"
        sys.modules["basic_pitch"] = mock_bp

        try:
            response = await client.get("/health")
            assert response.status_code == 200

            body = response.json()
            assert body["status"] == "ok"
            assert "basic_pitch_version" in body
            assert "queue_depth" in body
            assert isinstance(body["queue_depth"], int)
        finally:
            # Clean up the mock
            if "basic_pitch" in sys.modules and isinstance(
                sys.modules["basic_pitch"], MagicMock
            ):
                del sys.modules["basic_pitch"]


# ---------------------------------------------------------------------------
# Integration tests (require Basic Pitch installed)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestFullIntegration:
    """
    Full integration tests that run real Basic Pitch inference.

    These tests require:
    - basic-pitch package installed
    - Model downloaded (happens on first run)

    Run with: pytest -m integration
    Skip with: pytest -m "not integration"
    """

    async def test_real_conversion_produces_notes(
        self, integration_client, piano_wav_path: Path
    ):
        """Submit a real WAV file and verify Basic Pitch detects notes."""
        with open(piano_wav_path, "rb") as f:
            response = await integration_client.post(
                "/convert",
                files={"file": ("piano_c_major.wav", f, "audio/wav")},
            )

        assert response.status_code == 202
        job_id = response.json()["job_id"]

        # Poll with longer timeout for real inference
        max_polls = 60
        for _ in range(max_polls):
            await asyncio.sleep(0.5)
            status_resp = await integration_client.get(f"/status/{job_id}")
            data = status_resp.json()
            if data["status"] in ("completed", "failed"):
                break

        assert data["status"] == "completed", f"Job failed: {data}"
        assert data["result"]["notes_detected"] > 0
        assert len(data["result"]["piano_roll_notes"]) > 0

        # Download and verify MIDI file
        file_resp = await integration_client.get(f"/file/{job_id}/output.mid")
        assert file_resp.status_code == 200
        assert file_resp.content[:4] == b"MThd"
