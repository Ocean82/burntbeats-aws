"""Lightweight tests for midi_service /soundfonts listing."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_soundfonts_lists_default(client_factory, monkeypatch, tmp_path):
    sf_dir = tmp_path / "soundfonts"
    sf_dir.mkdir()
    default_sf = sf_dir / "GeneralUser_GS.sf2"
    default_sf.write_bytes(b"SF2PLACEHOLDER")

    monkeypatch.setattr("midi_service.routes.ops.SOUNDFONT_DIR", sf_dir)
    monkeypatch.setattr("midi_service.routes.ops.DEFAULT_SOUNDFONT", default_sf.name)

    async with client_factory() as client:
        res = await client.get("/soundfonts")
        assert res.status_code == 200
        data = res.json()
        assert data["default_available"] is True
        assert any(item["name"] == default_sf.name for item in data["soundfonts"])
