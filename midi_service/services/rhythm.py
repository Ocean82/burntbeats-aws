"""
Rhythm generation service — rules-based drum pattern generation with
style-aware grooves, hat choke, swing, and humanized timing.

Ported from the PRO RHYTHM PATCH. Supports styles:
techno, house, trap, dnb, rock, hiphop, jazz, latin, reggae.
"""

from __future__ import annotations

import io
import os
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pretty_midi

# ─── Drum Map (General MIDI) ──────────────────────────────────────

PITCH_MAP: Dict[str, int] = {
    "subkick": 35,
    "kick": 36,
    "rim": 37,
    "snare": 38,
    "clap": 39,
    "hihat": 42,
    "pedal": 44,
    "ohat": 46,
    "crash": 49,
    "ride": 51,
    "tom_hi": 48,
    "tom_lo": 45,
    "cowbell": 56,
    "shaker": 70,
}

# ─── Helpers ──────────────────────────────────────────────────────


def _rng(seed: Optional[Union[int, str]] = None) -> np.random.Generator:
    if seed is None:
        s = int.from_bytes(os.urandom(8), "little")
        return np.random.default_rng(s)
    if isinstance(seed, str):
        return np.random.default_rng(abs(hash(seed)) % (2**63))
    return np.random.default_rng(seed)


# ─── Core MIDI Writer ─────────────────────────────────────────────


def steps_to_midi(
    steps: List[Dict[str, int]],
    *,
    tempo: float = 128.0,
    steps_per_quarter: int = 8,
    swing: float = 0.55,
    humanize: float = 0.004,
    velocity_jitter: int = 6,
    choke_hats: bool = True,
    hat_decay: float = 0.045,
) -> pretty_midi.PrettyMIDI:
    """
    Convert step events to a PrettyMIDI object.

    Each step is a dict mapping instrument name -> velocity (1-127).
    Empty dict or missing key = rest for that instrument.
    """
    if steps_per_quarter <= 0 or tempo <= 0:
        raise ValueError("tempo > 0 and steps_per_quarter > 0 required")

    step_dur = 60.0 / tempo / steps_per_quarter
    sustain = step_dur
    swing = float(np.clip(swing, 0.0, 1.0))

    steps_per_eighth = steps_per_quarter // 2 if steps_per_quarter % 2 == 0 else None
    eighth_dur = (steps_per_eighth * step_dur) if steps_per_eighth else None
    max_swing_delay = (eighth_dur / 6.0) if eighth_dur else 0.0

    midi = pretty_midi.PrettyMIDI(initial_tempo=tempo)
    midi.time_signature_changes.append(pretty_midi.TimeSignature(4, 4, time=0.0))

    drum = pretty_midi.Instrument(program=0, is_drum=True, name="Drums")
    rng = np.random.default_rng()

    active_ohats: List[pretty_midi.Note] = []
    choker_names = {"hihat", "pedal"}
    epsilon = 0.001

    for i, ev in enumerate(steps):
        if not ev:
            continue

        start = i * step_dur

        # Swing offset for off-eighth steps
        swing_offset = 0.0
        if steps_per_eighth and swing > 0:
            pos_in_pair = i % (steps_per_eighth * 2)
            if pos_in_pair >= steps_per_eighth:
                swing_offset = swing * max_swing_delay

        # Humanize
        jitter = float(rng.uniform(-humanize, humanize)) if humanize > 0 else 0.0
        t0 = max(0.0, start + swing_offset + jitter)
        t1 = t0 + sustain

        # Hat choke logic
        if choke_hats and active_ohats:
            has_choker = any(name in choker_names for name in ev)
            if has_choker:
                for note in active_ohats:
                    if note.end > t0:
                        note.end = max(note.start + 0.005, t0 - epsilon)
                active_ohats = [n for n in active_ohats if n.end > t0 - epsilon]

        for name, base_vel in ev.items():
            pitch = PITCH_MAP.get(name)
            if pitch is None:
                continue

            vel = base_vel
            if velocity_jitter > 0:
                vel += int(rng.integers(-velocity_jitter, velocity_jitter + 1))
            vel = int(np.clip(vel, 1, 127))

            note_end = t1
            if choke_hats and name == "ohat" and hat_decay > 0:
                note_end = min(t1, t0 + hat_decay)

            note = pretty_midi.Note(velocity=vel, pitch=pitch, start=t0, end=note_end)
            drum.notes.append(note)

            if choke_hats and name == "ohat":
                active_ohats.append(note)

    midi.instruments.append(drum)
    return midi


# ─── Style-Aware Groove Generator ─────────────────────────────────


def generate_groove(
    *,
    style: str = "rock",
    bars: int = 4,
    tempo: float = 120.0,
    energy: float = 0.7,
    swing_pct: float = 0.0,
    seed: Optional[Union[int, str]] = None,
) -> Tuple[List[Dict[str, int]], Dict[str, Any]]:
    """
    Generate a groove pattern for the given style.

    Returns (steps, metadata) where steps is a list of dicts
    mapping instrument names to velocities.
    """
    style = style.lower().strip()
    energy = float(np.clip(energy, 0.0, 1.0))
    rng = _rng(seed)

    # Determine grid resolution
    spq = 12 if style == "trap" else 4  # steps per quarter
    steps_per_bar = spq * 4
    total = bars * steps_per_bar
    steps: List[Dict[str, int]] = [{} for _ in range(total)]

    def add(idx: int, name: str, vel: int) -> None:
        if 0 <= idx < total:
            steps[idx][name] = int(np.clip(vel, 1, 127))

    def hard(base: int = 120) -> int:
        return int(np.clip(rng.integers(base, 128), 1, 127))

    def mid(base: int = 95) -> int:
        return int(np.clip(rng.integers(base, 115), 1, 127))

    def ghost(base: int = 42) -> int:
        return int(np.clip(rng.integers(25, base), 1, 127))

    # ─── ROCK ───────────────────────────────────────────────────
    if style == "rock":
        for b in range(bars):
            b0 = b * steps_per_bar
            # Kick on 1 and 3
            add(b0, "kick", hard(120))
            add(b0 + 2 * spq, "kick", hard(115))
            # Snare on 2 and 4
            add(b0 + spq, "snare", hard(120))
            add(b0 + 3 * spq, "snare", hard(120))
            # Hi-hat 8ths
            for q in range(4):
                add(b0 + q * spq, "hihat", mid(100))
                if spq >= 2:
                    add(b0 + q * spq + spq // 2, "hihat", mid(85))

    # ─── HIP-HOP ───────────────────────────────────────────────
    elif style in ("hiphop", "hip-hop"):
        for b in range(bars):
            b0 = b * steps_per_bar
            add(b0, "kick", hard(124))
            add(b0 + int(2.5 * spq), "kick", mid(110))
            add(b0 + spq, "snare", hard(120))
            add(b0 + 3 * spq, "snare", hard(120))
            # Off-beat hats
            for q in range(4):
                off = b0 + q * spq + spq // 2
                add(off, "hihat", mid(90))
            if energy > 0.5 and rng.random() < 0.6:
                add(b0 + int(3.5 * spq), "snare", ghost(55))

    # ─── EDM / HOUSE ────────────────────────────────────────────
    elif style in ("edm", "house", "techno"):
        for b in range(bars):
            b0 = b * steps_per_bar
            # Four-on-the-floor kick
            for q in range(4):
                add(b0 + q * spq, "kick", hard(124))
            # Clap on 2 and 4
            add(b0 + spq, "clap", hard(118))
            add(b0 + 3 * spq, "clap", hard(118))
            # Off-beat open hat
            for q in range(4):
                add(b0 + q * spq + spq // 2, "ohat", mid(105))
            # Closed hat 16ths if energy high
            if energy > 0.6:
                sixteenth = max(1, spq // 4)
                for s in range(steps_per_bar):
                    if s % sixteenth == 0 and "ohat" not in steps[b0 + s]:
                        add(b0 + s, "hihat", mid(90))

    # ─── TRAP ───────────────────────────────────────────────────
    elif style == "trap":
        for b in range(bars):
            b0 = b * steps_per_bar
            # Sparse heavy kicks
            add(b0, "kick", hard(126))
            add(b0 + 2 * spq, "kick", hard(120))
            if rng.random() < 0.5:
                add(b0 + int(3.5 * spq), "kick", mid(110))
            # Clap on 3
            add(b0 + 2 * spq, "clap", hard(120))
            # Hi-hat rolls with varying density
            trip = spq // 3  # triplet spacing
            for s in range(steps_per_bar):
                if s % trip == 0:
                    vel = mid(95) if s % (trip * 2) == 0 else ghost(60)
                    add(b0 + s, "hihat", vel)
            # Ratchets on high-energy bars
            if energy > 0.7 and b % 2 == 1:
                ratch_start = b0 + 3 * spq
                for r in range(min(6, spq)):
                    add(ratch_start + r, "hihat", int(90 + r * 5))

    # ─── DRUM & BASS ────────────────────────────────────────────
    elif style == "dnb":
        for b in range(bars):
            b0 = b * steps_per_bar
            add(b0, "kick", hard(120))
            add(b0 + int(1.6 * spq), "kick", mid(110))
            add(b0 + spq, "snare", hard(122))
            add(b0 + 3 * spq, "snare", hard(122))
            # Fast hats
            for s in range(steps_per_bar):
                if s % max(1, spq // 4) == 0:
                    add(b0 + s, "hihat", mid(92))

    # ─── JAZZ ───────────────────────────────────────────────────
    elif style == "jazz":
        for b in range(bars):
            b0 = b * steps_per_bar
            # Ride pattern (swing)
            for q in range(4):
                add(b0 + q * spq, "ride", hard(105))
                if spq >= 3:
                    add(b0 + q * spq + int(spq * 0.67), "ride", mid(85))
            # Kick feathering
            add(b0, "kick", ghost(50))
            add(b0 + 2 * spq, "kick", ghost(45))
            # Ghost snare
            if rng.random() < 0.4:
                add(b0 + spq + spq // 2, "snare", ghost(40))
            # Cross-stick on 4
            add(b0 + 3 * spq, "rim", mid(95))

    # ─── LATIN ──────────────────────────────────────────────────
    elif style == "latin":
        for b in range(bars):
            b0 = b * steps_per_bar
            # Kick: tumbao-style
            add(b0, "kick", hard(115))
            add(b0 + int(1.5 * spq), "kick", mid(105))
            add(b0 + int(2.5 * spq), "kick", mid(100))
            # Snare on 2 and 4
            add(b0 + spq, "snare", hard(110))
            add(b0 + 3 * spq, "snare", hard(110))
            # Shaker or hi-hat steady
            for s in range(steps_per_bar):
                if s % max(1, spq // 2) == 0:
                    add(b0 + s, "hihat", mid(80))
            # Cowbell on off-beats
            if energy > 0.5:
                for q in range(4):
                    add(b0 + q * spq + spq // 2, "cowbell", mid(90))

    # ─── REGGAE ─────────────────────────────────────────────────
    elif style == "reggae":
        for b in range(bars):
            b0 = b * steps_per_bar
            # One-drop: kick+snare on 3
            add(b0 + 2 * spq, "kick", hard(120))
            add(b0 + 2 * spq, "snare", hard(115))
            # Off-beat hi-hat (skank rhythm)
            for q in range(4):
                add(b0 + q * spq + spq // 2, "hihat", mid(95))
            # Rim on 2
            add(b0 + spq, "rim", mid(90))

    # ─── FALLBACK ───────────────────────────────────────────────
    else:
        # Basic 4/4 pattern
        for b in range(bars):
            b0 = b * steps_per_bar
            add(b0, "kick", hard())
            add(b0 + 2 * spq, "kick", hard())
            add(b0 + spq, "snare", hard())
            add(b0 + 3 * spq, "snare", hard())
            for q in range(4):
                add(b0 + q * spq, "hihat", mid())

    # Compute actual swing for the MIDI writer
    midi_swing = (
        swing_pct / 100.0 if swing_pct > 0 else (0.55 if style == "jazz" else 0.0)
    )

    meta = {
        "style": style,
        "bars": bars,
        "tempo": tempo,
        "energy": energy,
        "steps_per_quarter": spq,
        "swing": midi_swing,
        "seed": seed,
        "total_steps": total,
    }
    return steps, meta


# ─── Public API ────────────────────────────────────────────────────


def generate_rhythm_midi(
    *,
    style: str = "rock",
    bars: int = 4,
    tempo: float = 120.0,
    energy: float = 0.7,
    swing_pct: float = 0.0,
    seed: Optional[Union[int, str]] = None,
) -> Tuple[bytes, Dict[str, Any]]:
    """
    Generate a rhythm pattern and return (midi_bytes, metadata).

    The MIDI bytes can be returned directly as a file download.
    """
    steps, meta = generate_groove(
        style=style,
        bars=bars,
        tempo=tempo,
        energy=energy,
        swing_pct=swing_pct,
        seed=seed,
    )

    midi = steps_to_midi(
        steps,
        tempo=tempo,
        steps_per_quarter=meta["steps_per_quarter"],
        swing=meta["swing"],
        humanize=0.004,
        choke_hats=True,
        hat_decay=0.045 if style in ("techno", "house", "edm", "trap", "dnb") else 0.0,
    )

    # Write to bytes
    buf = io.BytesIO()
    midi.write(buf)
    buf.seek(0)

    return buf.read(), meta


# ─── Variation Generators ──────────────────────────────────────────


def apply_variation(
    steps: List[Dict[str, int]],
    variation: str,
    meta: Dict[str, Any],
) -> List[Dict[str, int]]:
    """Apply a fill, breakdown, or buildup variation to an existing pattern."""
    result = [dict(s) for s in steps]
    total = len(result)
    spq = meta.get("steps_per_quarter", 4)

    if variation == "fill":
        # Add snare roll in last quarter
        fill_start = int(total * 0.75)
        for i in range(fill_start, total):
            progress = (i - fill_start) / max(1, total - fill_start)
            vel = int(60 + 60 * progress)
            result[i]["snare"] = vel
            result[i].pop("hihat", None)
            result[i].pop("ohat", None)
            if (i - fill_start) % 2 == 1:
                result[i]["tom_hi" if progress < 0.5 else "tom_lo"] = int(
                    80 + 30 * progress
                )

    elif variation == "breakdown":
        # Strip to essentials
        for i in range(total):
            result[i].pop("hihat", None)
            result[i].pop("ohat", None)
            result[i].pop("ride", None)
            result[i].pop("clap", None)
            result[i].pop("cowbell", None)
            # Kick only on downbeats
            if "kick" in result[i] and i % (spq * 2) != 0:
                result[i].pop("kick")

    elif variation == "buildup":
        # Increasing hat density + snare ghost notes
        for i in range(total):
            progress = i / max(1, total - 1)
            if i % max(1, int(spq / (1 + progress * 3))) == 0:
                result[i]["hihat"] = int(60 + 60 * progress)
            if progress > 0.5 and i % 2 == 1:
                result[i].setdefault("snare", int(40 + 50 * (progress - 0.5) * 2))
            # Four-on-floor kick for energy
            if i % spq == 0:
                result[i].setdefault("kick", int(100 + 20 * progress))

    return result
