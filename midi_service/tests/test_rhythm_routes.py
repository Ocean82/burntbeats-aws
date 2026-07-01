"""Route-level integration tests for midi_service rhythm endpoints.

Covers:
  GET  /rhythm/styles
  POST /rhythm/generate
  POST /rhythm/generate/json
  POST /rhythm/generate/full
  POST /rhythm/variation
  POST /rhythm/era/generate
  POST /rhythm/era/generate/json
  Auth enforcement (401 when token required but missing/invalid)
"""

from __future__ import annotations

import base64
import io

import pretty_midi
import pytest
from httpx import ASGITransport, AsyncClient

from midi_service.app import create_app
from midi_service.config import MIDI_SERVICE_API_TOKEN


def _make_client_factory(tmp_path):
    """Build an async test client for rhythm route tests."""

    async def _factory(
        *,
        service_api_token: str = MIDI_SERVICE_API_TOKEN or "",
    ):
        output_dir = tmp_path / "midi_output"
        output_dir.mkdir(parents=True, exist_ok=True)

        import midi_service.app as app_module
        from midi_service.config import MIDI_SERVICE_API_TOKEN as _config_token

        with (
            pytest.MonkeyPatch().context() as mp,
        ):
            # Patch both the env var and the already-imported config constant
            # so create_app() picks up the test token.
            mp.setenv("MIDI_SERVICE_API_TOKEN", service_api_token)
            mp.setattr(app_module, "MIDI_SERVICE_API_TOKEN", service_api_token)
            # Prevent any background worker from starting
            mp.setattr(app_module, "preload_model", lambda: None)
            mp.setattr(app_module, "start_worker", lambda *a, **kw: None)
            mp.setattr(app_module, "stop_worker", lambda: None)
            mp.setattr(app_module, "enqueue_job", lambda *a, **kw: None)
            mp.setattr(app_module, "get_queue_depth", lambda: 0)

            app = create_app()
            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as ac:
                yield ac

    return _factory


@pytest.fixture
async def rhythm_client(tmp_path):
    """Async client with auth token enabled (mirrors production behavior)."""
    factory = _make_client_factory(tmp_path)
    async for ac in factory(service_api_token="test-rhythm-token"):
        yield ac


@pytest.fixture
async def rhythm_client_no_auth(tmp_path):
    """Async client with no API token configured (auth bypassed)."""
    factory = _make_client_factory(tmp_path)
    async for ac in factory(service_api_token=""):
        yield ac


class TestRhythmStyles:
    """GET /rhythm/styles"""

    async def test_returns_style_list(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.get("/rhythm/styles", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert "styles" in body
        assert "variations" in body
        style_ids = [s["id"] for s in body["styles"]]
        for expected in ("rock", "hiphop", "edm", "jazz", "latin", "reggae", "techno", "trap", "dnb"):
            assert expected in style_ids

    async def test_variations_list_contains_fill_breakdown_buildup(
        self, rhythm_client: AsyncClient
    ):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.get("/rhythm/styles", headers=headers)
        assert r.status_code == 200
        assert set(r.json()["variations"]) == {"fill", "breakdown", "buildup"}

    async def test_unauthorized_without_token(self, rhythm_client: AsyncClient):
        r = await rhythm_client.get("/rhythm/styles")
        assert r.status_code == 401


class TestRhythmGenerate:
    """POST /rhythm/generate"""

    async def test_generates_midi_bytes(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/generate",
            headers=headers,
            json={"style": "rock", "bars": 2, "tempo": 120.0},
        )
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/midi"
        assert 'filename="rhythm_rock_120bpm_2bars.mid"' in r.headers["content-disposition"]
        # Verify it's valid MIDI by parsing with pretty_midi
        midi = pretty_midi.PrettyMIDI(io.BytesIO(r.content))
        assert len(midi.instruments) >= 1
        assert midi.instruments[0].is_drum

    async def test_generates_different_styles(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        for style in ("hiphop", "edm", "jazz", "techno", "trap", "dnb", "latin", "reggae"):
            r = await rhythm_client.post(
                "/rhythm/generate",
                headers=headers,
                json={"style": style, "bars": 1, "tempo": 120.0},
            )
            assert r.status_code == 200
            assert r.headers["content-type"] == "audio/midi"

    async def test_validates_bars_range(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/generate",
            headers=headers,
            json={"style": "rock", "bars": 0, "tempo": 120.0},
        )
        assert r.status_code == 422

    async def test_validates_tempo_range(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/generate",
            headers=headers,
            json={"style": "rock", "bars": 1, "tempo": 999.0},
        )
        assert r.status_code == 422

    async def test_response_headers_include_metadata(
        self, rhythm_client: AsyncClient
    ):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/generate",
            headers=headers,
            json={"style": "rock", "bars": 2, "tempo": 120.0},
        )
        assert r.status_code == 200
        assert "X-Rhythm-Style" in r.headers
        assert r.headers["X-Rhythm-Style"] == "rock"
        assert "X-Rhythm-Bars" in r.headers
        assert r.headers["X-Rhythm-Bars"] == "2"
        assert "X-Rhythm-Tempo" in r.headers
        assert r.headers["X-Rhythm-Tempo"] == "120.0"


class TestRhythmGenerateJson:
    """POST /rhythm/generate/json"""

    async def test_returns_base64_midi_and_metadata(
        self, rhythm_client: AsyncClient
    ):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/generate/json",
            headers=headers,
            json={"style": "rock", "bars": 2, "tempo": 120.0},
        )
        assert r.status_code == 200
        body = r.json()
        assert "midi_base64" in body
        assert "metadata" in body
        assert "filename" in body
        # Decode and verify valid MIDI
        midi_bytes = base64.b64decode(body["midi_base64"])
        midi = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
        assert len(midi.instruments) >= 1
        assert "steps_per_quarter" in body["metadata"]
        assert "swing" in body["metadata"]

    async def test_metadata_matches_request(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/generate/json",
            headers=headers,
            json={"style": "hiphop", "bars": 4, "tempo": 90.0, "energy": 0.8},
        )
        assert r.status_code == 200
        meta = r.json()["metadata"]
        assert meta["style"] == "hiphop"
        assert meta["bars"] == 4
        assert meta["tempo"] == 90.0


class TestRhythmGenerateFull:
    """POST /rhythm/generate/full"""

    async def test_full_generation_with_fills(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/generate/full",
            headers=headers,
            json={
                "style": "rock",
                "bars": 4,
                "tempo": 120.0,
                "fill_every": 2,
                "fill_style": "auto",
                "fill_len_beats": 1.0,
            },
        )
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/midi"
        content = r.content
        assert len(content) > 0

    async def test_full_generation_with_drift(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/generate/full",
            headers=headers,
            json={
                "style": "motown_60s",
                "bars": 2,
                "tempo": 100.0,
                "drift_rate_hz": 0.3,
                "drift_depth": 0.005,
                "flutter_rate_hz": 6.0,
                "flutter_depth": 0.001,
                "drift_vel_pp": 5,
            },
        )
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/midi"


class TestRhythmVariation:
    """POST /rhythm/variation"""

    async def test_apply_fill_variation(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/variation",
            headers=headers,
            json={
                "style": "rock",
                "bars": 4,
                "tempo": 120.0,
                "variation": "fill",
            },
        )
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/midi"

    async def test_apply_breakdown_variation(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/variation",
            headers=headers,
            json={
                "style": "edm",
                "bars": 4,
                "tempo": 128.0,
                "variation": "breakdown",
            },
        )
        assert r.status_code == 200

    async def test_apply_buildup_variation(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/variation",
            headers=headers,
            json={
                "style": "techno",
                "bars": 4,
                "tempo": 130.0,
                "variation": "buildup",
            },
        )
        assert r.status_code == 200

    async def test_invalid_variation_returns_400(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/variation",
            headers=headers,
            json={
                "style": "rock",
                "bars": 4,
                "tempo": 120.0,
                "variation": "nonexistent",
            },
        )
        assert r.status_code == 400


class TestRhythmEraGenerate:
    """POST /rhythm/era/generate and /json"""

    async def test_era_generate_returns_midi(self, rhythm_client: AsyncClient):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/era/generate",
            headers=headers,
            json={"era": "motown_60s", "bars": 4, "energy": 0.8},
        )
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/midi"
        assert "era_motown_60s_" in r.headers["content-disposition"]

    async def test_era_generate_json_returns_metadata(
        self, rhythm_client: AsyncClient
    ):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/era/generate/json",
            headers=headers,
            json={"era": "boom_bap_94", "bars": 2, "energy": 0.9},
        )
        assert r.status_code == 200
        body = r.json()
        assert "midi_base64" in body
        assert "metadata" in body
        assert body["metadata"]["era"] == "boom_bap_94"

    async def test_era_generate_with_tempo_override(
        self, rhythm_client: AsyncClient
    ):
        headers = {"X-Midi-Service-Token": "test-rhythm-token"}
        r = await rhythm_client.post(
            "/rhythm/era/generate",
            headers=headers,
            json={"era": "disco_77", "bars": 2, "tempo": 140.0},
        )
        assert r.status_code == 200
        assert r.headers["X-Rhythm-Tempo"] == "140.0"


class TestRhythmAuthBypass:
    """Auth is bypassed when no token is configured (dev/test mode)."""

    async def test_styles_accessible_without_token_when_disabled(
        self, rhythm_client_no_auth: AsyncClient
    ):
        r = await rhythm_client_no_auth.get("/rhythm/styles")
        assert r.status_code == 200

    async def test_generate_accessible_without_token_when_disabled(
        self, rhythm_client_no_auth: AsyncClient
    ):
        r = await rhythm_client_no_auth.post(
            "/rhythm/generate",
            json={"style": "rock", "bars": 1, "tempo": 120.0},
        )
        assert r.status_code == 200
