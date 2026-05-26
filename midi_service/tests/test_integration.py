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
import json
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

    async def test_invalid_numeric_convert_option_returns_400(
        self, client, piano_wav_path: Path
    ):
        """Malformed numeric form fields should fail with a 400, not a 500."""
        with open(piano_wav_path, "rb") as f:
            response = await client.post(
                "/convert",
                files={"file": ("piano_c_major.wav", f, "audio/wav")},
                data={"quantize_bpm": "fast"},
            )

        assert response.status_code == 400
        assert "detail" in response.json()

    async def test_invalid_quantize_grid_returns_400(
        self, client, piano_wav_path: Path
    ):
        """Unsupported quantize grids should fail at the API boundary."""
        with open(piano_wav_path, "rb") as f:
            response = await client.post(
                "/convert",
                files={"file": ("piano_c_major.wav", f, "audio/wav")},
                data={"quantize": "true", "quantize_grid": "1/3"},
            )

        assert response.status_code == 400
        assert "detail" in response.json()


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

    async def test_health_reports_storage_diagnostics(self, client):
        """Health endpoint should expose resolved MIDI storage diagnostics."""
        response = await client.get("/health")
        assert response.status_code == 200

        body = response.json()
        assert "storage" in body
        assert body["storage"]["ok"] is True
        assert body["storage"]["output_dir"]
        assert body["storage"]["resolved_output_dir"]
        assert body["storage"]["can_read"] is True
        assert body["storage"]["can_write"] is True
        assert "auth" in body
        assert "token_required" in body["auth"]


# ---------------------------------------------------------------------------
# Additional contract coverage for Phase 1 refactor safety
# ---------------------------------------------------------------------------


def _write_merge_job_artifacts(
    output_dir: Path,
    job_id: str,
    *,
    status: str = "completed",
    notes: list[dict] | None = None,
) -> None:
    job_dir = output_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    notes = notes or [
        {"pitch": 60, "start": 0.0, "duration": 0.5, "velocity": 90},
        {"pitch": 64, "start": 0.5, "duration": 0.5, "velocity": 92},
    ]
    progress = {
        "status": status,
        "job_id": job_id,
        "progress": 100 if status == "completed" else 50,
        "message": "Conversion complete" if status == "completed" else "Processing",
        "result": {"piano_roll_notes": notes} if status == "completed" else {},
    }
    (job_dir / "progress.json").write_text(json.dumps(progress), encoding="utf-8")


class TestServiceTokenAuth:
    async def test_status_requires_service_token_when_configured(self, client_factory):
        async with client_factory(service_api_token="secret-token") as client:
            job_id = "00000000-0000-0000-0000-000000000000"

            unauthorized = await client.get(f"/status/{job_id}")
            assert unauthorized.status_code == 401
            assert unauthorized.json()["detail"] == "Unauthorized"

            authorized = await client.get(
                f"/status/{job_id}",
                headers={"X-Midi-Service-Token": "secret-token"},
            )
            assert authorized.status_code == 404

    async def test_merge_requires_service_token_when_configured(self, client_factory):
        async with client_factory(service_api_token="secret-token") as client:
            job_id = "11111111-1111-4111-8111-111111111111"
            _write_merge_job_artifacts(
                Path(getattr(client, "_test_midi_output_dir")),
                job_id,
            )

            unauthorized = await client.post(
                "/merge",
                json={"jobs": [{"job_id": job_id, "stem_name": "vocals"}]},
            )
            assert unauthorized.status_code == 401
            assert unauthorized.json()["detail"] == "Unauthorized"

            authorized = await client.post(
                "/merge",
                json={"jobs": [{"job_id": job_id, "stem_name": "vocals"}]},
                headers={"X-Midi-Service-Token": "secret-token"},
            )
            assert authorized.status_code == 200
            assert authorized.content[:4] == b"MThd"


class TestQueueAndMergeContracts:
    async def test_convert_returns_503_when_queue_is_full(
        self, client_factory, piano_wav_path: Path
    ):
        async with client_factory(enqueue_error=RuntimeError("queue full")) as client:
            with open(piano_wav_path, "rb") as f:
                response = await client.post(
                    "/convert",
                    files={"file": ("piano_c_major.wav", f, "audio/wav")},
                )

        assert response.status_code == 503
        assert response.json()["detail"] == "MIDI service queue is full"

    async def test_merge_returns_multitrack_midi_and_track_header(self, client):
        output_dir = Path(getattr(client, "_test_midi_output_dir"))
        first_job_id = "22222222-2222-4222-8222-222222222222"
        second_job_id = "33333333-3333-4333-8333-333333333333"
        _write_merge_job_artifacts(output_dir, first_job_id)
        _write_merge_job_artifacts(
            output_dir,
            second_job_id,
            notes=[{"pitch": 36, "start": 0.0, "duration": 0.25, "velocity": 110}],
        )

        response = await client.post(
            "/merge",
            json={
                "jobs": [
                    {"job_id": first_job_id, "stem_name": "vocals", "program": 52},
                    {"job_id": second_job_id, "stem_name": "drums", "is_drum": True},
                ],
                "bpm": 128,
            },
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("audio/midi")
        assert response.headers["x-merge-tracks"] == "2"
        assert response.content[:4] == b"MThd"

    async def test_merge_rejects_jobs_that_are_not_completed(self, client):
        output_dir = Path(getattr(client, "_test_midi_output_dir"))
        job_id = "44444444-4444-4444-8444-444444444444"
        _write_merge_job_artifacts(output_dir, job_id, status="processing")

        response = await client.post(
            "/merge",
            json={"jobs": [{"job_id": job_id, "stem_name": "vocals"}]},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == f"Job not completed: {job_id}"


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
