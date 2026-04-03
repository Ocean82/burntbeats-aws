#!/usr/bin/env python3
"""
API Endpoint Verification Script
Tests all backend endpoints for reactivity and correctness.
"""

import sys
import time
import uuid
import json
import wave
import struct
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import requests

BASE_URL = "http://127.0.0.1:3001"
STEM_SERVICE_URL = "http://127.0.0.1:5000"


class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def add_pass(self, name):
        self.passed += 1
        print(f"  ✓ {name}")

    def add_fail(self, name, reason):
        self.failed += 1
        self.errors.append(f"{name}: {reason}")
        print(f"  ✗ {name} - {reason}")

    def summary(self):
        print(f"\n{'=' * 60}")
        print(f"Results: {self.passed} passed, {self.failed} failed")
        if self.errors:
            print("\nFailures:")
            for e in self.errors:
                print(f"  - {e}")
        return self.failed == 0


def create_test_audio(duration_sec=1, sample_rate=44100):
    """Create a simple test WAV file in memory."""
    import io
    import numpy as np

    num_samples = int(duration_sec * sample_rate)

    # Generate a simple sine wave
    frequency = 440  # A4 note
    t = np.linspace(0, duration_sec, num_samples, endpoint=False)
    audio_data = np.sin(2 * np.pi * frequency * t)

    # Convert to 16-bit PCM
    audio_data = (audio_data * 32767).astype(np.int16)

    # Create WAV in memory
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())

    buffer.seek(0)
    return buffer


def test_health_endpoints(results: TestResults):
    """Test health check endpoints."""
    print("\n📡 Testing Health Endpoints")

    # Backend health
    try:
        resp = requests.get(f"{BASE_URL}/api/health", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok":
                results.add_pass("GET /api/health (backend)")
            else:
                results.add_fail(
                    "GET /api/health (backend)", f"Unexpected response: {data}"
                )
        else:
            results.add_fail("GET /api/health (backend)", f"Status {resp.status_code}")
    except Exception as e:
        results.add_fail("GET /api/health (backend)", str(e))

    # Stem service health
    try:
        resp = requests.get(f"{STEM_SERVICE_URL}/health", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok":
                results.add_pass("GET /health (stem service)")
            else:
                results.add_fail(
                    "GET /health (stem service)", f"Unexpected response: {data}"
                )
        else:
            results.add_fail("GET /health (stem service)", f"Status {resp.status_code}")
    except Exception as e:
        results.add_fail("GET /health (stem service)", str(e))


def test_split_endpoint(results: TestResults):
    """Test stem split endpoint."""
    print("\n📤 Testing Split Endpoint")

    try:
        # Create test audio
        audio_file = create_test_audio(duration_sec=2)
        files = {"file": ("test.wav", audio_file, "audio/wav")}
        data = {"stems": "2", "quality": "speed"}

        start = time.time()
        resp = requests.post(
            f"{BASE_URL}/api/stems/split", files=files, data=data, timeout=60
        )
        elapsed = time.time() - start

        if resp.status_code == 202:
            result = resp.json()
            if "job_id" in result:
                results.add_pass("POST /api/stems/split (returns job_id)")

                # Test polling
                job_id = result["job_id"]
                poll_test = test_status_polling(job_id, results)
                return job_id if poll_test else None
            else:
                results.add_fail(
                    "POST /api/stems/split", f"No job_id in response: {result}"
                )
        else:
            results.add_fail(
                "POST /api/stems/split", f"Status {resp.status_code}: {resp.text[:200]}"
            )
    except Exception as e:
        results.add_fail("POST /api/stems/split", str(e))

    return None


def test_status_polling(job_id: str, results: TestResults, max_wait=120):
    """Test job status polling with reactivity."""
    print("\n🔄 Testing Status Polling")

    start = time.time()
    last_progress = -1
    progress_updates = []

    while time.time() - start < max_wait:
        try:
            resp = requests.get(f"{BASE_URL}/api/stems/status/{job_id}", timeout=10)

            if resp.status_code == 200:
                data = resp.json()
                status = data.get("status")
                progress = data.get("progress", 0)

                # Track progress updates for reactivity
                if progress != last_progress:
                    progress_updates.append((time.time() - start, progress, status))
                    last_progress = progress

                if status == "completed":
                    results.add_pass(
                        f"Status polling (completed in {time.time() - start:.1f}s)"
                    )
                    results.add_pass(
                        f"Progress updates received: {len(progress_updates)}"
                    )
                    if len(progress_updates) > 1:
                        results.add_pass("Reactive progress updates detected")
                    return data
                elif status == "failed":
                    error = data.get("error", "Unknown error")
                    results.add_fail("Status polling", f"Job failed: {error}")
                    return None
            elif resp.status_code == 404:
                results.add_fail("Status polling", "Job not found (404)")
                return None
            else:
                results.add_fail(
                    "Status polling", f"Unexpected status {resp.status_code}"
                )
                return None

        except Exception as e:
            results.add_fail("Status polling", str(e))
            return None

        time.sleep(1.5)  # Match polling interval

    results.add_fail("Status polling", f"Timeout after {max_wait}s")
    return None


def test_expand_endpoint(results: TestResults, source_job_id: str):
    """Test expand to 4 stems endpoint."""
    print("\n🔀 Testing Expand Endpoint")

    try:
        data = {"job_id": source_job_id, "quality": "speed"}
        resp = requests.post(f"{BASE_URL}/api/stems/expand", json=data, timeout=60)

        if resp.status_code == 202:
            result = resp.json()
            if "job_id" in result:
                results.add_pass("POST /api/stems/expand (returns new job_id)")

                # Wait for completion
                expand_job_id = result["job_id"]
                max_wait = 180  # 3 min for expand
                start = time.time()

                while time.time() - start < max_wait:
                    time.sleep(2)
                    status_resp = requests.get(
                        f"{BASE_URL}/api/stems/status/{expand_job_id}", timeout=10
                    )
                    if status_resp.status_code == 200:
                        status_data = status_resp.json()
                        if status_data.get("status") == "completed":
                            stems = status_data.get("stems", [])
                            stem_ids = [s["id"] for s in stems]
                            if len(stems) == 4:
                                results.add_pass(
                                    f"Expand completed with 4 stems: {stem_ids}"
                                )
                            else:
                                results.add_fail(
                                    "Expand result",
                                    f"Expected 4 stems, got {len(stems)}",
                                )
                            return True
                        elif status_data.get("status") == "failed":
                            results.add_fail(
                                "Expand", f"Job failed: {status_data.get('error')}"
                            )
                            return False

                results.add_fail("Expand", "Timeout waiting for completion")
                return False
            else:
                results.add_fail("POST /api/stems/expand", f"No job_id in response")
        else:
            results.add_fail("POST /api/stems/expand", f"Status {resp.status_code}")
    except Exception as e:
        results.add_fail("POST /api/stems/expand", str(e))

    return False


def test_stem_file_endpoint(results: TestResults, job_id: str, stem_id: str = "vocals"):
    """Test stem file retrieval."""
    print(f"\n📁 Testing Stem File Endpoint (GET /api/stems/file/:job_id/:stemId)")

    try:
        resp = requests.get(
            f"{BASE_URL}/api/stems/file/{job_id}/{stem_id}.wav", timeout=30
        )

        if resp.status_code == 200:
            content_type = resp.headers.get("Content-Type", "")
            if "audio" in content_type or "wav" in content_type:
                results.add_pass("GET stem file (returns audio)")

                # Verify it's a valid WAV
                content = resp.content
                if len(content) > 44:  # WAV header + some data
                    # Check RIFF header
                    if content[:4] == b"RIFF" and content[8:12] == b"WAVE":
                        results.add_pass("Stem file is valid WAV format")
                    else:
                        results.add_fail("Stem file format", "Not a valid WAV file")
                else:
                    results.add_fail("Stem file size", "File too small")
            else:
                results.add_fail("GET stem file", f"Wrong Content-Type: {content_type}")
        elif resp.status_code == 404:
            results.add_fail(
                "GET stem file", "Stem file not found (job may not be complete)"
            )
        else:
            results.add_fail("GET stem file", f"Status {resp.status_code}")
    except Exception as e:
        results.add_fail("GET stem file", str(e))


def test_cancel_endpoint(results: TestResults):
    """Test job cancellation endpoint."""
    print("\n🛑 Testing Cancel Endpoint")

    try:
        # Start a new split job
        audio_file = create_test_audio(duration_sec=1)
        files = {"file": ("test.wav", audio_file, "audio/wav")}
        data = {"stems": "2", "quality": "speed"}

        resp = requests.post(
            f"{BASE_URL}/api/stems/split", files=files, data=data, timeout=30
        )

        if resp.status_code == 202:
            job_id = resp.json()["job_id"]

            # Wait a moment for job to start
            time.sleep(2)

            # Try to cancel
            cancel_resp = requests.delete(f"{BASE_URL}/api/stems/{job_id}", timeout=10)

            if cancel_resp.status_code in (200, 202):
                results.add_pass("DELETE /api/stems/:job_id (cancel accepted)")

                # Verify status shows cancelled
                time.sleep(1)
                status_resp = requests.get(
                    f"{BASE_URL}/api/stems/status/{job_id}", timeout=10
                )
                if status_resp.status_code == 200:
                    status_data = status_resp.json()
                    if status_data.get("status") == "cancelled":
                        results.add_pass("Job correctly marked as cancelled")
                    elif status_data.get("status") == "completed":
                        results.add_fail(
                            "Cancel", "Job completed before cancellation took effect"
                        )
            else:
                results.add_fail(
                    "DELETE /api/stems/:job_id", f"Status {cancel_resp.status_code}"
                )
        else:
            results.add_fail(
                "Cancel test setup", f"Could not start job: {resp.status_code}"
            )
    except Exception as e:
        results.add_fail("DELETE /api/stems/:job_id", str(e))


def test_cleanup_endpoint(results: TestResults):
    """Test cleanup endpoint."""
    print("\n🧹 Testing Cleanup Endpoint")

    try:
        resp = requests.post(f"{BASE_URL}/api/stems/cleanup?maxAgeHours=0", timeout=30)

        # 503 means API_KEY not set (expected in some configs)
        if resp.status_code in (200, 202, 503):
            if resp.status_code == 200:
                data = resp.json()
                results.add_pass("POST /api/stems/cleanup (authenticated)")
            else:
                results.add_pass(
                    "POST /api/stems/cleanup (auth required - API_KEY not set)"
                )
        else:
            results.add_fail("POST /api/stems/cleanup", f"Status {resp.status_code}")
    except Exception as e:
        results.add_fail("POST /api/stems/cleanup", str(e))

    # Test GET returns 405
    try:
        resp = requests.get(f"{BASE_URL}/api/stems/cleanup", timeout=10)
        if resp.status_code == 405:
            results.add_pass("GET /api/stems/cleanup (method not allowed)")
        else:
            results.add_fail(
                "GET /api/stems/cleanup", f"Should return 405, got {resp.status_code}"
            )
    except Exception as e:
        results.add_fail("GET /api/stems/cleanup", str(e))


def test_error_handling(results: TestResults):
    """Test error handling and validation."""
    print("\n⚠️  Testing Error Handling")

    # Invalid UUID
    try:
        resp = requests.get(f"{BASE_URL}/api/stems/status/not-a-uuid", timeout=5)
        if resp.status_code == 400:
            results.add_pass("Invalid UUID returns 400")
        else:
            results.add_fail("Invalid UUID", f"Expected 400, got {resp.status_code}")
    except Exception as e:
        results.add_fail("Invalid UUID test", str(e))

    # Non-existent job
    try:
        fake_uuid = str(uuid.uuid4())
        resp = requests.get(f"{BASE_URL}/api/stems/status/{fake_uuid}", timeout=5)
        if resp.status_code == 404:
            results.add_pass("Non-existent job returns 404")
        else:
            results.add_fail(
                "Non-existent job", f"Expected 404, got {resp.status_code}"
            )
    except Exception as e:
        results.add_fail("Non-existent job test", str(e))

    # Invalid stem ID
    try:
        fake_uuid = str(uuid.uuid4())
        resp = requests.get(
            f"{BASE_URL}/api/stems/file/{fake_uuid}/invalid.wav", timeout=5
        )
        if resp.status_code == 400:
            results.add_pass("Invalid stem ID returns 400")
        else:
            results.add_fail("Invalid stem ID", f"Expected 400, got {resp.status_code}")
    except Exception as e:
        results.add_fail("Invalid stem ID test", str(e))


def main():
    print("=" * 60)
    print("BurntBeats API Endpoint Verification")
    print("=" * 60)

    results = TestResults()

    # Test basic connectivity
    print("\n🔌 Testing Service Connectivity")
    try:
        requests.get(f"{BASE_URL}/api/health", timeout=5)
        results.add_pass("Backend service reachable")
    except:
        results.add_fail("Backend service", "Cannot connect to http://localhost:3001")
        print("\n⚠️  Backend not running. Start with: npm run dev (in backend/)")
        return False

    try:
        requests.get(f"{STEM_SERVICE_URL}/health", timeout=5)
        results.add_pass("Stem service reachable")
    except:
        results.add_fail("Stem service", f"Cannot connect to {STEM_SERVICE_URL}")
        print(
            "\n⚠️  Stem service not running. Start with: python -m uvicorn (in stem_service/)"
        )
        return False

    # Run tests
    test_health_endpoints(results)
    test_error_handling(results)

    # These require actual split processing
    job_id = test_split_endpoint(results)

    if job_id:
        # Test stem file retrieval
        test_stem_file_endpoint(results, job_id, "vocals")
        test_stem_file_endpoint(results, job_id, "instrumental")

        # Test expand
        test_expand_endpoint(results, job_id)

    test_cancel_endpoint(results)
    test_cleanup_endpoint(results)

    # Final summary
    print()
    return results.summary()


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
