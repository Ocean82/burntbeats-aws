from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from midi_service.harmonic_analysis import analyze_harmony
from .common import require_api_token

MAX_NOTES = 10_000


def build_analyze_router() -> APIRouter:
    router = APIRouter()

    @router.post("/analyze")
    async def analyze_midi_harmony(request: Request) -> dict:
        require_api_token(request)
        """
        Analyze note events for harmonic structure.

        Accepts piano-roll note data, BPM, and time signature.
        Returns key estimate with confidence, per-bar chord labels,
        and chord progression summary.
        """
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")

        notes = body.get("notes", [])
        if not isinstance(notes, list):
            raise HTTPException(400, "'notes' must be an array of note objects")

        if len(notes) > MAX_NOTES:
            raise HTTPException(422, f"Too many notes ({len(notes)} > {MAX_NOTES})")

        if not notes:
            return {
                "key": "unknown",
                "key_confidence": 0.0,
                "mode": "unknown",
                "bar_count": 0,
                "bars": [],
                "chord_progression": "—",
                "total_notes": 0,
            }

        bpm = float(body.get("bpm", 120.0))
        time_signature = str(body.get("time_signature", "4/4"))

        result = analyze_harmony(notes, bpm=bpm, time_signature=time_signature)
        return result

    return router
