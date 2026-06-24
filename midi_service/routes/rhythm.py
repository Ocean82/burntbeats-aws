"""
Rhythm generation API routes.

Endpoints:
  POST /rhythm/generate          — Generate a rhythm pattern as MIDI
  POST /rhythm/generate/full     — Generate with fills, drift, subkick
  GET  /rhythm/styles            — List available groove styles
  POST /rhythm/variation         — Apply variation to a generated pattern
  POST /rhythm/era/generate      — Generate era-accurate groove
  POST /rhythm/era/generate/json — Era groove as base64 JSON
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from midi_service.services.rhythm import (
    generate_groove,
    generate_rhythm_midi,
    generate_rhythm_midi_full,
    generate_era_groove,
    generate_era_rhythm_midi,
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
    # New optional fields
    subkick_enabled: bool = Field(
        default=False, description="Add subkick doubling the kick"
    )
    fill_every: int = Field(
        default=0, ge=0, le=16, description="Apply hard fill every N bars (0 = off)"
    )
    fill_style: str = Field(
        default="auto", description="Fill style: auto, snare_buzz, tom_run, combo"
    )
    fill_len_beats: float = Field(
        default=1.0, ge=0.25, le=4.0, description="Fill duration in beats"
    )
    drift_rate_hz: float = Field(
        default=0.0, ge=0.0, le=10.0, description="Vinyl wow rate (Hz, 0=off)"
    )
    drift_depth: float = Field(
        default=0.0, ge=0.0, le=0.05, description="Vinyl wow depth (seconds)"
    )
    flutter_rate_hz: float = Field(
        default=0.0, ge=0.0, le=50.0, description="Vinyl flutter rate (Hz, 0=off)"
    )
    flutter_depth: float = Field(
        default=0.0, ge=0.0, le=0.01, description="Vinyl flutter depth (seconds)"
    )
    drift_vel_pp: int = Field(
        default=0, ge=0, le=20, description="Velocity wobble peak-to-peak"
    )


class RhythmVariationRequest(BaseModel):
    style: str = Field(default="rock")
    bars: int = Field(default=4, ge=1, le=32)
    tempo: float = Field(default=120.0, ge=40, le=300)
    energy: float = Field(default=0.7, ge=0.0, le=1.0)
    swing_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    seed: Optional[str] = Field(default=None)
    variation: str = Field(description="Variation type: fill, breakdown, or buildup")


class EraRhythmGenerateRequest(BaseModel):
    era: str = Field(
        default="motown_60s",
        description="Era profile: motown_60s, philly_70s, disco_77, new_jack_90, boom_bap_94, g_funk_96, doo_wop_12_8",
    )
    bars: int = Field(default=8, ge=1, le=32, description="Number of bars")
    energy: float = Field(default=0.8, ge=0.0, le=1.0, description="Energy level")
    tempo: Optional[float] = Field(
        default=None, ge=40, le=300, description="Override era tempo (None = era default)"
    )
    seed: Optional[str] = Field(default=None, description="Random seed")
    fill_every: int = Field(default=4, ge=0, le=16, description="Fill every N bars")
    fill_style: str = Field(default="auto", description="Fill style")
    subkick_enabled: bool = Field(default=False)


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
    # ─── Era Styles ───────────────────────────────────────────
    StyleInfo(
        id="motown_60s",
        name="Motown (60s)",
        description="Tambourine-driven four-on-the-floor with vinyl warmth",
        default_tempo=104,
        default_swing=58,
    ),
    StyleInfo(
        id="philly_70s",
        name="Philly Soul (70s)",
        description="Smooth four-on-the-floor with cowbell accents",
        default_tempo=116,
        default_swing=54,
    ),
    StyleInfo(
        id="disco_77",
        name="Disco (77)",
        description="Four-on-the-floor with open hats and tight pocket",
        default_tempo=125,
        default_swing=52,
    ),
    StyleInfo(
        id="new_jack_90",
        name="New Jack Swing (90)",
        description="Swing feel with shaker and syncopated kick",
        default_tempo=110,
        default_swing=60,
    ),
    StyleInfo(
        id="boom_bap_94",
        name="Boom Bap (94)",
        description="Lo-fi hip-hop with ghost snares and heavy drift",
        default_tempo=92,
        default_swing=62,
    ),
    StyleInfo(
        id="g_funk_96",
        name="G-Funk (96)",
        description="Laid-back West Coast with conga accents",
        default_tempo=95,
        default_swing=60,
    ),
    StyleInfo(
        id="doo_wop_12_8",
        name="Doo-Wop (12/8)",
        description="Slow 12/8 ballad with ride bell and heavy drift",
        default_tempo=80,
        default_swing=0,
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
            if any([body.fill_every, body.drift_rate_hz, body.subkick_enabled, body.drift_depth, body.flutter_rate_hz, body.flutter_depth, body.drift_vel_pp]):
                midi_bytes, meta = generate_rhythm_midi_full(
                    style=body.style, bars=body.bars, tempo=body.tempo,
                    energy=body.energy, swing_pct=body.swing_pct, seed=body.seed,
                    fill_every=body.fill_every, fill_style=body.fill_style,
                    fill_len_beats=body.fill_len_beats,
                    subkick_enabled=body.subkick_enabled,
                    drift_rate_hz=body.drift_rate_hz, drift_depth=body.drift_depth,
                    flutter_rate_hz=body.flutter_rate_hz, flutter_depth=body.flutter_depth,
                    drift_vel_pp=body.drift_vel_pp,
                )
            else:
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
            if any([body.fill_every, body.drift_rate_hz, body.subkick_enabled, body.drift_depth, body.flutter_rate_hz, body.flutter_depth, body.drift_vel_pp]):
                midi_bytes, meta = generate_rhythm_midi_full(
                    style=body.style, bars=body.bars, tempo=body.tempo,
                    energy=body.energy, swing_pct=body.swing_pct, seed=body.seed,
                    fill_every=body.fill_every, fill_style=body.fill_style,
                    fill_len_beats=body.fill_len_beats,
                    subkick_enabled=body.subkick_enabled,
                    drift_rate_hz=body.drift_rate_hz, drift_depth=body.drift_depth,
                    flutter_rate_hz=body.flutter_rate_hz, flutter_depth=body.flutter_depth,
                    drift_vel_pp=body.drift_vel_pp,
                )
            else:
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

    @router.post("/generate/full")
    async def generate_full(request: Request, body: RhythmGenerateRequest) -> Response:
        """Generate a rhythm pattern with fills, drift, subkick (explicit endpoint)."""
        require_api_token(request)

        try:
            midi_bytes, meta = generate_rhythm_midi_full(
                style=body.style, bars=body.bars, tempo=body.tempo,
                energy=body.energy, swing_pct=body.swing_pct, seed=body.seed,
                fill_every=body.fill_every, fill_style=body.fill_style,
                fill_len_beats=body.fill_len_beats,
                subkick_enabled=body.subkick_enabled,
                drift_rate_hz=body.drift_rate_hz, drift_depth=body.drift_depth,
                flutter_rate_hz=body.flutter_rate_hz, flutter_depth=body.flutter_depth,
                drift_vel_pp=body.drift_vel_pp,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Full rhythm generation failed: {e}") from e

        filename = f"rhythm_{body.style}_full_{int(body.tempo)}bpm_{body.bars}bars.mid"
        return Response(
            content=midi_bytes,
            media_type="audio/midi",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Rhythm-Style": body.style,
                "X-Rhythm-Bars": str(body.bars),
                "X-Rhythm-Tempo": str(body.tempo),
            },
        )

    @router.post("/era/generate")
    async def era_generate(request: Request, body: EraRhythmGenerateRequest) -> Response:
        """Generate an era-accurate drum groove with vinyl drift and fills."""
        require_api_token(request)

        try:
            midi_bytes, meta = generate_era_rhythm_midi(
                era=body.era, bars=body.bars, energy=body.energy,
                tempo=body.tempo, seed=body.seed,
                fill_every=body.fill_every, fill_style=body.fill_style,
                subkick_enabled=body.subkick_enabled,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Era generation failed: {e}") from e

        filename = f"era_{body.era}_{int(meta['tempo'])}bpm_{body.bars}bars.mid"
        return Response(
            content=midi_bytes,
            media_type="audio/midi",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Rhythm-Era": body.era,
                "X-Rhythm-Bars": str(body.bars),
                "X-Rhythm-Tempo": str(meta["tempo"]),
                "X-Rhythm-Time-Sig": f'{meta["time_signature"][0]}/{meta["time_signature"][1]}',
            },
        )

    @router.post("/era/generate/json")
    async def era_generate_json(request: Request, body: EraRhythmGenerateRequest) -> dict:
        """Generate an era groove and return base64 MIDI + metadata."""
        require_api_token(request)

        import base64

        try:
            midi_bytes, meta = generate_era_rhythm_midi(
                era=body.era, bars=body.bars, energy=body.energy,
                tempo=body.tempo, seed=body.seed,
                fill_every=body.fill_every, fill_style=body.fill_style,
                subkick_enabled=body.subkick_enabled,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        return {
            "midi_base64": base64.b64encode(midi_bytes).decode("ascii"),
            "metadata": meta,
            "filename": f"era_{body.era}_{int(meta['tempo'])}bpm_{body.bars}bars.mid",
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
