"""
Rhythm generation API routes.

Endpoints:
  POST /rhythm/generate — Generate a rhythm pattern as MIDI
  GET  /rhythm/styles   — List available groove styles
  POST /rhythm/variation — Apply variation to a generated pattern
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from midi_service.services.rhythm import (
    generate_groove,
    generate_rhythm_midi,
    apply_variation,
    steps_to_midi,
    PITCH_MAP,
)
from .common import require_api_token

import io


# ─── Request/Response Models ──────────────────────────────────────


class RhythmGenerateRequest(BaseModel):
    style: str = Field(
        default="rock",
        description="Groove style: rock, hiphop, edm, house, techno, trap, dnb, jazz, latin, reggae",
    )
    bars: int = Field(default=4, ge=1, le=32, description="Number of bars to generate")
    tempo: float = Field(default=120.0, ge=40, le=300, description="BPM")
    energy: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Energy/complexity level"
    )
    swing_pct: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Swing percentage"
    )
    seed: Optional[str] = Field(
        default=None, description="Random seed for reproducibility"
    )


class RhythmVariationRequest(BaseModel):
    style: str = Field(default="rock")
    bars: int = Field(default=4, ge=1, le=32)
    tempo: float = Field(default=120.0, ge=40, le=300)
    energy: float = Field(default=0.7, ge=0.0, le=1.0)
    swing_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    seed: Optional[str] = Field(default=None)
    variation: str = Field(description="Variation type: fill, breakdown, or buildup")


class StyleInfo(BaseModel):
    id: str
    name: str
    description: str
    default_tempo: float
    default_swing: float


# ─── Available Styles ─────────────────────────────────────────────

AVAILABLE_STYLES = [
    StyleInfo(
        id="rock",
        name="Rock",
        description="Steady 4/4 with strong backbeat",
        default_tempo=120,
        default_swing=0,
    ),
    StyleInfo(
        id="hiphop",
        name="Hip-Hop",
        description="Boom bap with off-beat hats",
        default_tempo=90,
        default_swing=30,
    ),
    StyleInfo(
        id="edm",
        name="EDM/House",
        description="Four-on-the-floor with off-beat hats",
        default_tempo=128,
        default_swing=0,
    ),
    StyleInfo(
        id="techno",
        name="Techno",
        description="Driving four-on-the-floor with 16th hats",
        default_tempo=130,
        default_swing=0,
    ),
    StyleInfo(
        id="trap",
        name="Trap",
        description="Sparse kicks with triplet hat rolls",
        default_tempo=140,
        default_swing=0,
    ),
    StyleInfo(
        id="dnb",
        name="Drum & Bass",
        description="Broken beat with fast hats",
        default_tempo=174,
        default_swing=0,
    ),
    StyleInfo(
        id="jazz",
        name="Jazz",
        description="Ride pattern with brush comping",
        default_tempo=140,
        default_swing=55,
    ),
    StyleInfo(
        id="latin",
        name="Latin",
        description="Tumbao kick with cowbell",
        default_tempo=100,
        default_swing=10,
    ),
    StyleInfo(
        id="reggae",
        name="Reggae",
        description="One-drop with off-beat skank",
        default_tempo=75,
        default_swing=10,
    ),
]


# ─── Router ───────────────────────────────────────────────────────


def build_rhythm_router() -> APIRouter:
    router = APIRouter(prefix="/rhythm", tags=["rhythm"])

    @router.get("/styles")
    async def list_styles(request: Request) -> dict:
        """List available groove styles with their defaults."""
        require_api_token(request)
        return {
            "styles": [s.model_dump() for s in AVAILABLE_STYLES],
            "variations": ["fill", "breakdown", "buildup"],
        }

    @router.post("/generate")
    async def generate(request: Request, body: RhythmGenerateRequest) -> Response:
        """
        Generate a rhythm pattern and return it as a MIDI file.

        Returns binary .mid content with appropriate headers.
        """
        require_api_token(request)

        try:
            midi_bytes, meta = generate_rhythm_midi(
                style=body.style,
                bars=body.bars,
                tempo=body.tempo,
                energy=body.energy,
                swing_pct=body.swing_pct,
                seed=body.seed,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Rhythm generation failed: {e}",
            ) from e

        filename = f"rhythm_{body.style}_{int(body.tempo)}bpm_{body.bars}bars.mid"

        return Response(
            content=midi_bytes,
            media_type="audio/midi",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Rhythm-Style": body.style,
                "X-Rhythm-Bars": str(body.bars),
                "X-Rhythm-Tempo": str(body.tempo),
                "X-Rhythm-Steps-Per-Quarter": str(meta["steps_per_quarter"]),
            },
        )

    @router.post("/generate/json")
    async def generate_json(request: Request, body: RhythmGenerateRequest) -> dict:
        """
        Generate a rhythm pattern and return metadata + base64 MIDI.

        Useful for clients that want to inspect the pattern metadata
        before downloading.
        """
        require_api_token(request)

        import base64

        try:
            midi_bytes, meta = generate_rhythm_midi(
                style=body.style,
                bars=body.bars,
                tempo=body.tempo,
                energy=body.energy,
                swing_pct=body.swing_pct,
                seed=body.seed,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        return {
            "midi_base64": base64.b64encode(midi_bytes).decode("ascii"),
            "metadata": meta,
            "filename": f"rhythm_{body.style}_{int(body.tempo)}bpm_{body.bars}bars.mid",
        }

    @router.post("/variation")
    async def variation(request: Request, body: RhythmVariationRequest) -> Response:
        """
        Generate a rhythm pattern with a variation applied (fill/breakdown/buildup).

        Returns the modified pattern as a MIDI file.
        """
        require_api_token(request)

        if body.variation not in ("fill", "breakdown", "buildup"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid variation: {body.variation}. Must be: fill, breakdown, buildup",
            )

        try:
            # Generate base pattern
            steps, meta = generate_groove(
                style=body.style,
                bars=body.bars,
                tempo=body.tempo,
                energy=body.energy,
                swing_pct=body.swing_pct,
                seed=body.seed,
            )

            # Apply variation
            varied_steps = apply_variation(steps, body.variation, meta)

            # Convert to MIDI
            midi = steps_to_midi(
                varied_steps,
                tempo=body.tempo,
                steps_per_quarter=meta["steps_per_quarter"],
                swing=meta["swing"],
                humanize=0.004,
                choke_hats=True,
                hat_decay=(
                    0.045
                    if body.style in ("techno", "house", "edm", "trap", "dnb")
                    else 0.0
                ),
            )

            buf = io.BytesIO()
            midi.write(buf)
            midi_bytes = buf.getvalue()

        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Variation generation failed: {e}",
            ) from e

        filename = f"rhythm_{body.style}_{body.variation}_{int(body.tempo)}bpm.mid"

        return Response(
            content=midi_bytes,
            media_type="audio/midi",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Rhythm-Style": body.style,
                "X-Rhythm-Variation": body.variation,
            },
        )

    return router
