"""
Rhythm generation service — rules-based drum pattern generation with
style-aware grooves, hat choke, swing, humanized timing, vintage vinyl
drift, era-accurate historical groove profiles, and hard fill patterns.

Ported from the PRO RHYTHM PATCH + FIRE IT UP groove engine.
"""

from __future__ import annotations

import io
import os
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pretty_midi

# ─── Drum Map (General MIDI — extended percussion) ────────────────

PITCH_MAP: Dict[str, int] = {
    "subkick": 35,
    "kick": 36,
    "rim": 37,
    "snare": 38,
    "clap": 39,
    "hihat": 42,
    "pedal": 44,
    "ohat": 46,
    "toml": 45,
    "tomm": 47,
    "tomh": 50,
    "crash": 49,
    "ride": 51,
    "ridebell": 53,
    "tamb": 54,
    "cowbell": 56,
    "cabasa": 69,
    "maracas": 70,
    "shaker": 82,
    "bongo_hi": 60,
    "bongo_lo": 61,
    "conga_mute": 62,
    "conga_open": 63,
    "conga_low": 64,
}

# Legacy aliases — map old names to new ones
_PITCH_MAP_ALIASES: Dict[str, str] = {
    "tom_hi": "tom_mid",
    "tom_lo": "toml",
}

# Also add the mid-tom at GM 48 for backward-compat alias resolution
PITCH_MAP["tom_mid"] = 48

# ─── Helpers ──────────────────────────────────────────────────────


def _rng(seed: Optional[Union[int, str]] = None) -> np.random.Generator:
    if seed is None:
        s = int.from_bytes(os.urandom(8), "little")
        return np.random.default_rng(s)
    if isinstance(seed, str):
        return np.random.default_rng(abs(hash(seed)) % (2**63))
    return np.random.default_rng(seed)


def _pitch(name: str) -> int | None:
    """Resolve a drum name, checking aliases for backward compat."""
    p = PITCH_MAP.get(name)
    if p is not None:
        return p
    alias = _PITCH_MAP_ALIASES.get(name)
    if alias is not None:
        return PITCH_MAP.get(alias)
    return None


# ─── Core MIDI Writer with Vinyl Drift ────────────────────────────


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
    time_signature: Optional[Tuple[int, int]] = None,
    split_stems: bool = False,
    drift_rate_hz: float = 0.0,
    drift_depth: float = 0.0,
    flutter_rate_hz: float = 0.0,
    flutter_depth: float = 0.0,
    drift_vel_pp: int = 0,
) -> pretty_midi.PrettyMIDI:
    """
    Convert step events to a PrettyMIDI object.

    Each step is a dict mapping instrument name -> velocity (1-127).
    Empty dict or missing key = rest for that instrument.

    New optional params (all default to zero / off for backward compat):
      time_signature  – (num, den) e.g. (12, 8); defaults to (4, 4) when None
      split_stems     – one MIDI track per drum piece
      drift_rate_hz   – wow rate (Hz) for vinyl timing drift
      drift_depth     – wow depth (seconds)
      flutter_rate_hz – flutter rate (Hz)
      flutter_depth   – flutter depth (seconds)
      drift_vel_pp    – peak-to-peak velocity wobble (MIDI units)
    """
    if steps_per_quarter <= 0 or tempo <= 0:
        raise ValueError("tempo > 0 and steps_per_quarter > 0 required")

    step_dur = 60.0 / tempo / steps_per_quarter
    sustain = step_dur
    swing = float(np.clip(swing, 0.0, 1.0))

    steps_per_eighth = steps_per_quarter // 2 if steps_per_quarter % 2 == 0 else None
    eighth_dur = (steps_per_eighth * step_dur) if steps_per_eighth else None
    max_swing_delay = (eighth_dur / 6.0) if eighth_dur else 0.0

    if time_signature is not None:
        ts_num, ts_den = time_signature
    else:
        ts_num, ts_den = 4, 4

    midi = pretty_midi.PrettyMIDI(initial_tempo=tempo)
    midi.time_signature_changes.append(pretty_midi.TimeSignature(ts_num, ts_den, time=0.0))

    rng = np.random.default_rng()

    # Vinyl drift phase seeds
    phase_wow = float(rng.uniform(0, 2 * np.pi))
    phase_flutter = float(rng.uniform(0, 2 * np.pi))
    phase_vel = float(rng.uniform(0, 2 * np.pi))

    # Instrument containers
    if split_stems:
        stems: Dict[str, pretty_midi.Instrument] = {}

        def get_inst(name: str) -> pretty_midi.Instrument:
            if name not in stems:
                stems[name] = pretty_midi.Instrument(program=0, is_drum=True, name=f"Drums-{name}")
            return stems[name]
    else:
        drum = pretty_midi.Instrument(program=0, is_drum=True, name="Drums")

    active_ohats: List[pretty_midi.Note] = []
    choker_names = {"hihat", "pedal"}
    epsilon = 0.001

    for i, ev in enumerate(steps):
        if not ev:
            continue

        start = i * step_dur

        # Vinyl drift timing
        wow_offset = (drift_depth * np.sin(2 * np.pi * drift_rate_hz * start + phase_wow)) if drift_depth > 0 else 0.0
        flutter_offset = (flutter_depth * np.sin(2 * np.pi * flutter_rate_hz * start + phase_flutter)) if flutter_depth > 0 else 0.0
        drift_timing = wow_offset + flutter_offset

        # Swing offset for off-eighth steps
        swing_offset = 0.0
        if steps_per_eighth and swing > 0:
            pos_in_pair = i % (steps_per_eighth * 2)
            if pos_in_pair >= steps_per_eighth:
                swing_offset = swing * max_swing_delay

        # Humanize
        jitter = float(rng.uniform(-humanize, humanize)) if humanize > 0 else 0.0
        t0 = max(0.0, start + swing_offset + jitter + drift_timing)
        t1_base = t0 + sustain

        # Expire finished open hats
        if choke_hats and active_ohats:
            active_ohats = [n for n in active_ohats if n.end > t0 - epsilon]

        # Hat choke logic
        if choke_hats and active_ohats:
            has_choker = any(name in choker_names for name in ev)
            if has_choker:
                for note in active_ohats:
                    if note.end > t0:
                        note.end = max(note.start + 0.005, t0 - epsilon)
                active_ohats = [n for n in active_ohats if n.end > t0 - epsilon]

        for name, base_vel in ev.items():
            pitch = _pitch(name)
            if pitch is None:
                continue

            vel = base_vel
            if velocity_jitter > 0:
                vel += int(rng.integers(-velocity_jitter, velocity_jitter + 1))

            # Vinyl drift velocity wobble
            if drift_vel_pp > 0:
                wobble = int(drift_vel_pp * 0.5 * np.sin(2 * np.pi * drift_rate_hz * start + phase_vel))
                vel += wobble

            vel = int(np.clip(vel, 1, 127))

            note_end = t1_base
            if choke_hats and name == "ohat" and hat_decay > 0:
                note_end = min(t1_base, t0 + hat_decay)

            note = pretty_midi.Note(velocity=vel, pitch=pitch, start=t0, end=note_end)

            if split_stems:
                get_inst(name).notes.append(note)
            else:
                drum.notes.append(note)

            if choke_hats and name == "ohat":
                active_ohats.append(note)

    if split_stems:
        for inst in stems.values():
            midi.instruments.append(inst)
    else:
        midi.instruments.append(drum)

    return midi


# ─── Era Profile System ───────────────────────────────────────────


def _era_profile(era: str) -> Dict[str, Any]:
    """Get era-specific groove parameters including vinyl drift defaults."""
    e = era.lower()

    prof: Dict[str, Any] = {
        "spq": 8,
        "tempo": (100, 120),
        "swing": 0.0,
        "humanize": 0.003,
        "time_sig": (4, 4),
        "hat_decay": 0.05,
        "wow_rate_hz": 0.25,
        "wow_depth_s": 0.004,
        "flutter_rate_hz": 6.0,
        "flutter_depth_s": 0.0007,
        "drift_vel_pp": 4,
    }

    if e == "motown_60s":
        prof.update(spq=8, tempo=(96, 112), swing=0.58, humanize=0.004, hat_decay=0.04,
                     wow_rate_hz=0.27, wow_depth_s=0.0045, drift_vel_pp=5)
    elif e == "philly_70s":
        prof.update(spq=8, tempo=(110, 124), swing=0.54, humanize=0.004,
                     wow_rate_hz=0.24, wow_depth_s=0.0035)
    elif e == "disco_77":
        prof.update(spq=8, tempo=(120, 130), swing=0.52, humanize=0.003, hat_decay=0.06,
                     wow_rate_hz=0.22, wow_depth_s=0.0025, drift_vel_pp=3)
    elif e == "new_jack_90":
        prof.update(spq=8, tempo=(106, 114), swing=0.60, humanize=0.004,
                     wow_rate_hz=0.28, wow_depth_s=0.0035)
    elif e == "boom_bap_94":
        prof.update(spq=8, tempo=(88, 96), swing=0.62, humanize=0.005, hat_decay=0.03,
                     wow_rate_hz=0.30, wow_depth_s=0.0065, flutter_depth_s=0.0009, drift_vel_pp=8)
    elif e == "g_funk_96":
        prof.update(spq=8, tempo=(92, 98), swing=0.60, humanize=0.005, hat_decay=0.04,
                     wow_rate_hz=0.26, wow_depth_s=0.005, drift_vel_pp=6)
    elif e == "doo_wop_12_8":
        prof.update(spq=12, tempo=(72, 88), swing=0.0, humanize=0.004, time_sig=(12, 8), hat_decay=0.07,
                     wow_rate_hz=0.23, wow_depth_s=0.0075, drift_vel_pp=7)

    return prof


# ─── Euclidean Rhythm Helper ──────────────────────────────────────


def _euclid(k: int, n: int, rotation: int = 0) -> np.ndarray:
    """Return a boolean mask of length n with k evenly spaced hits (Euclidean rhythm)."""
    if k <= 0:
        return np.zeros(n, dtype=bool)
    idx = np.unique(np.floor(np.arange(k) * n / k).astype(int))
    mask = np.zeros(n, dtype=bool)
    mask[(idx + rotation) % n] = True
    return mask


# ─── Hard Fill System ─────────────────────────────────────────────


def _apply_fills(
    steps: List[Dict[str, int]],
    bars: int,
    spq: int,
    energy: float,
    rng: np.random.Generator,
    style: str = "techno",
    fill_every: int = 4,
    fill_len_beats: float = 1.0,
    fill_style: str = "auto",
    add_crash_on_downbeat: bool = True,
    suppress_kick_in_fill: bool = True,
    mute_hats_in_fill: bool = True,
):
    """Apply hard fills with snare buzz rolls, tom runs, and crash cymbals."""
    if not fill_every or fill_every <= 0:
        return

    steps_per_bar = spq * 4
    total_steps = len(steps)

    def add(idx: int, name: str, vel: int):
        if 0 <= idx < total_steps:
            steps[idx][name] = int(np.clip(vel, 1, 127))

    def rm(idx: int, names: set[str]):
        for n in list(steps[idx].keys()):
            if n in names:
                del steps[idx][n]

    for b in range(bars):
        if (b + 1) % fill_every != 0:
            continue

        b0 = b * steps_per_bar
        bend = b0 + steps_per_bar
        start = max(b0, bend - int(round(fill_len_beats * spq)))
        if start >= bend:
            continue

        if suppress_kick_in_fill:
            for i in range(start, bend):
                rm(i, {"kick", "subkick"})

        if mute_hats_in_fill:
            for i in range(start, bend):
                rm(i, {"hihat", "ohat", "pedal"})

        # Choose fill style
        fs = fill_style.lower()
        if fs == "auto":
            if style in {"techno", "house"}:
                fs = "combo"
            elif style == "trap":
                fs = "snare_buzz"
            else:
                fs = "tom_run"

        # Snare buzz: dense strokes ramping into the drop
        if fs in {"snare_buzz", "combo"}:
            spacing = max(1, spq // 6)
            v_start = int(80 + 15 * energy)
            v_end = int(120 + 7 * energy)
            hits = list(range(start, bend, spacing))
            for k, i in enumerate(hits):
                v = int(np.interp(k, [0, max(1, len(hits) - 1)], [v_start, v_end]))
                add(i, "snare", v)
                if rng.random() < 0.35 and (i + 1) < bend:
                    add(i + 1, "snare", max(40, v - 25))

        # Tom run: descending / out-and-back
        if fs in {"tom_run", "combo"}:
            tom_seq = ["tomh", "tomm", "toml", "tomm", "tomh", "toml"]
            seg_len = max(3, int((bend - start) * 0.5))
            t0 = bend - seg_len
            positions = np.linspace(t0, bend - 1, num=min(len(tom_seq), seg_len), dtype=int)
            v0 = int(95 + 10 * energy)
            v1 = int(120 + 7 * energy)
            for k, pos in enumerate(positions):
                name = tom_seq[k % len(tom_seq)]
                v = int(np.interp(k, [0, len(positions) - 1], [v0, v1]))
                add(pos, name, v)

        # Crash on the next bar downbeat
        if add_crash_on_downbeat:
            next_downbeat = bend
            if next_downbeat < total_steps:
                add(next_downbeat, "crash", int(np.clip(118 + int(7 * energy), 1, 127)))
                if style in {"techno", "house"} and rng.random() < 0.35:
                    add(next_downbeat, "ride", int(np.clip(96 + int(10 * energy), 1, 127)))


# ─── Era Groove Generator ─────────────────────────────────────────


def generate_era_groove(
    era: str = "motown_60s",
    bars: int = 8,
    energy: float = 0.8,
    seed: Optional[Union[int, str]] = None,
    fill_every: int = 4,
    fill_len_beats: float = 1.0,
    fill_style: str = "auto",
    add_crash_on_downbeat: bool = True,
    suppress_kick_in_fill: bool = True,
    mute_hats_in_fill: bool = True,
) -> Tuple[List[Dict[str, int]], Dict[str, Any]]:
    """
    Generate era-specific drum grooves with authentic percussion and feel.

    Args:
        era: One of motown_60s, philly_70s, disco_77, new_jack_90,
             boom_bap_94, g_funk_96, doo_wop_12_8
        bars: Number of bars
        energy: Energy / density 0-1
        seed: Reproducible seed
        fill_every: Apply fills every N bars (0 = no fills)
        fill_len_beats: Fill duration in beats
        fill_style: auto | snare_buzz | tom_run | combo
        add_crash_on_downbeat: Crash after fill
        suppress_kick_in_fill: Remove kicks during fill
        mute_hats_in_fill: Remove hats during fill

    Returns:
        (steps, meta) where steps is list of dicts per step.
    """
    era = era.lower()
    pr = _era_profile(era)
    spq = pr["spq"]
    steps_per_bar = spq * 4
    total = bars * steps_per_bar
    rng = _rng(seed)
    energy = float(np.clip(energy, 0.0, 1.0))

    steps: List[Dict[str, int]] = [dict() for _ in range(total)]

    def add(idx: int, name: str, vel: int):
        if 0 <= idx < total:
            steps[idx][name] = int(np.clip(vel, 1, 127))

    def hard(v=120):
        return int(np.clip(rng.integers(v, 128), 1, 127))

    def mid(v=95):
        return int(np.clip(rng.integers(v, 115), 1, 127))

    def ghost(v=42):
        return int(np.clip(rng.integers(25, v), 1, 127))

    for b in range(bars):
        b0 = b * steps_per_bar

        if era == "motown_60s":
            for beat in [0, spq, 2 * spq, 3 * spq]:
                add(b0 + beat, "kick", hard(118))
            for s in [b0 + spq, b0 + 3 * spq]:
                add(s, "snare", hard(115))
            for i in range(b0 + spq // 2, b0 + steps_per_bar, spq):
                add(i, "tamb", mid(105))

        elif era == "philly_70s":
            for beat in [0, spq, 2 * spq, 3 * spq]:
                add(b0 + beat, "kick", hard(120))
            for s in [b0 + spq, b0 + 3 * spq]:
                add(s, "snare", hard(118))
            for i in [b0 + spq // 2, b0 + 2 * spq + spq // 2]:
                add(i, "cowbell", mid(110))

        elif era == "disco_77":
            for beat in [0, spq, 2 * spq, 3 * spq]:
                add(b0 + beat, "kick", hard(122))
            for s in [b0 + spq, b0 + 3 * spq]:
                add(s, "snare", hard(120))
            for i in range(b0 + spq // 2, b0 + steps_per_bar, spq):
                add(i, "ohat", mid(108))

        elif era == "new_jack_90":
            for beat in [0, 2 * spq]:
                add(b0 + beat, "kick", hard(120))
            for s in [b0 + spq, b0 + 3 * spq]:
                add(s, "snare", hard(118))
            for i in range(b0, b0 + steps_per_bar, spq // 2):
                add(i, "shaker", mid(95))

        elif era == "boom_bap_94":
            for k in [0, int(1.5 * spq), 2 * spq]:
                add(b0 + k, "kick", hard(118))
            for s in [b0 + spq, b0 + 3 * spq]:
                add(s, "snare", hard(125))
            if rng.random() < 0.7:
                add(b0 + spq - spq // 4, "snare", ghost(55))

        elif era == "g_funk_96":
            for k in [0, int(1.5 * spq), 2 * spq, int(3.5 * spq)]:
                add(b0 + k, "kick", hard(116))
            for s in [b0 + spq, b0 + 3 * spq]:
                add(s, "snare", hard(120))
            for i in [b0 + spq // 2, b0 + 2 * spq + spq // 2]:
                add(i, "conga_open", mid(100))

        elif era == "doo_wop_12_8":
            for beat in [0, 2 * spq, 4 * spq, 6 * spq]:
                add(b0 + beat, "kick", hard(115))
            for s in [b0 + spq, b0 + 3 * spq, b0 + 5 * spq, b0 + 7 * spq]:
                add(s, "snare", hard(118))
            for i in [b0, b0 + 4 * spq]:
                add(i, "ridebell", mid(105))

    _apply_fills(
        steps=steps, bars=bars, spq=spq, energy=energy, rng=rng,
        style=era, fill_every=fill_every, fill_len_beats=fill_len_beats,
        fill_style=fill_style, add_crash_on_downbeat=add_crash_on_downbeat,
        suppress_kick_in_fill=suppress_kick_in_fill, mute_hats_in_fill=mute_hats_in_fill,
    )

    meta: Dict[str, Any] = {
        "era": era,
        "bars": bars,
        "energy": energy,
        "steps_per_quarter": spq,
        "swing": pr["swing"],
        "humanize": pr["humanize"],
        "tempo_range": pr["tempo"],
        "time_signature": pr["time_sig"],
        "hat_decay": pr["hat_decay"],
        "wow_rate_hz": pr["wow_rate_hz"],
        "wow_depth_s": pr["wow_depth_s"],
        "flutter_rate_hz": pr["flutter_rate_hz"],
        "flutter_depth_s": pr["flutter_depth_s"],
        "drift_vel_pp": pr["drift_vel_pp"],
        "seed": seed,
    }
    return steps, meta


# ─── Style-Aware Groove Generator ─────────────────────────────────


def generate_groove(
    *,
    style: str = "rock",
    bars: int = 4,
    tempo: float = 120.0,
    energy: float = 0.7,
    swing_pct: float = 0.0,
    seed: Optional[Union[int, str]] = None,
    # New optional params (backward-compatible defaults)
    subkick_enabled: bool = False,
    fill_every: int = 0,
    fill_style: str = "auto",
    fill_len_beats: float = 1.0,
) -> Tuple[List[Dict[str, int]], Dict[str, Any]]:
    """
    Generate a groove pattern for the given style.

    Returns (steps, metadata) where steps is a list of dicts
    mapping instrument names to velocities.
    """
    style = style.lower().strip()
    energy = float(np.clip(energy, 0.0, 1.0))
    rng = _rng(seed)

    # Higher grid resolution: 8 spq (32nd) for most; 12 spq for trap
    spq = 12 if style == "trap" else 8
    steps_per_bar = spq * 4
    total = bars * steps_per_bar
    steps: List[Dict[str, int]] = [{} for _ in range(total)]

    def add(idx: int, name: str, vel: int) -> None:
        if 0 <= idx < total:
            steps[idx][name] = int(np.clip(vel, 1, 127))
            if subkick_enabled and name == "kick":
                steps[idx]["subkick"] = int(np.clip(vel - 15, 1, 127))

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
            # Ghost snare
            if energy > 0.5 and rng.random() < 0.45:
                add(b0 + int(1.5 * spq), "snare", ghost(55))
                add(b0 + int(2.5 * spq), "snare", ghost(45))

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
            # Ghost snare fills
            if energy > 0.6 and rng.random() < 0.5:
                add(b0 + int(2.5 * spq), "snare", ghost(50))

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
            if energy > 0.5 and rng.random() < 0.5:
                add(b0 + int(1.5 * spq), "snare", ghost(55))

    # ─── Fills ──────────────────────────────────────────────────
    if fill_every > 0:
        _apply_fills(
            steps=steps, bars=bars, spq=spq, energy=energy, rng=rng,
            style=style, fill_every=fill_every, fill_len_beats=fill_len_beats,
            fill_style=fill_style,
        )

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


# ─── Full Rhythm MIDI (fills + drift) ───────────────────────────────


def generate_rhythm_midi_full(
    *,
    style: str = "rock",
    bars: int = 4,
    tempo: float = 120.0,
    energy: float = 0.7,
    swing_pct: float = 0.0,
    seed: Optional[Union[int, str]] = None,
    subkick_enabled: bool = False,
    fill_every: int = 4,
    fill_style: str = "auto",
    fill_len_beats: float = 1.0,
    drift_rate_hz: float = 0.0,
    drift_depth: float = 0.0,
    flutter_rate_hz: float = 0.0,
    flutter_depth: float = 0.0,
    drift_vel_pp: int = 0,
    time_signature: Optional[Tuple[int, int]] = None,
    split_stems: bool = False,
) -> Tuple[bytes, Dict[str, Any]]:
    """
    Enhanced rhythm generator with fills and vinyl drift.
    All new params default to zero/off — fully backward compatible.
    """
    steps, meta = generate_groove(
        style=style, bars=bars, tempo=tempo, energy=energy,
        swing_pct=swing_pct, seed=seed,
        subkick_enabled=subkick_enabled,
        fill_every=fill_every, fill_style=fill_style, fill_len_beats=fill_len_beats,
    )

    midi = steps_to_midi(
        steps,
        tempo=tempo,
        steps_per_quarter=meta["steps_per_quarter"],
        swing=meta["swing"],
        humanize=0.004,
        choke_hats=True,
        hat_decay=0.045 if style in ("techno", "house", "edm", "trap", "dnb") else 0.0,
        time_signature=time_signature,
        split_stems=split_stems,
        drift_rate_hz=drift_rate_hz,
        drift_depth=drift_depth,
        flutter_rate_hz=flutter_rate_hz,
        flutter_depth=flutter_depth,
        drift_vel_pp=drift_vel_pp,
    )

    meta.update(
        subkick_enabled=subkick_enabled,
        fill_every=fill_every,
        fill_style=fill_style,
        drift_rate_hz=drift_rate_hz,
        drift_depth=drift_depth,
        flutter_rate_hz=flutter_rate_hz,
        flutter_depth=flutter_depth,
        drift_vel_pp=drift_vel_pp,
        time_signature=time_signature,
        split_stems=split_stems,
    )

    buf = io.BytesIO()
    midi.write(buf)
    buf.seek(0)
    return buf.read(), meta


def generate_era_rhythm_midi(
    era: str = "motown_60s",
    bars: int = 8,
    energy: float = 0.8,
    seed: Optional[Union[int, str]] = None,
    fill_every: int = 4,
    fill_style: str = "auto",
    fill_len_beats: float = 1.0,
    tempo: Optional[float] = None,
    swing_pct: float = 0.0,
    subkick_enabled: bool = False,
    split_stems: bool = False,
) -> Tuple[bytes, Dict[str, Any]]:
    """
    Generate era-accurate drum groove with vinyl drift and fills baked in.

    Returns (midi_bytes, metadata).
    """
    steps, meta = generate_era_groove(
        era=era, bars=bars, energy=energy, seed=seed,
        fill_every=fill_every, fill_style=fill_style, fill_len_beats=fill_len_beats,
    )

    tempo_val = tempo if tempo is not None else float(np.mean(meta["tempo_range"]))

    midi = steps_to_midi(
        steps,
        tempo=tempo_val,
        steps_per_quarter=meta["steps_per_quarter"],
        swing=meta["swing"],
        humanize=meta["humanize"],
        choke_hats=True,
        hat_decay=meta["hat_decay"],
        time_signature=meta["time_signature"],
        split_stems=split_stems,
        drift_rate_hz=meta["wow_rate_hz"],
        drift_depth=meta["wow_depth_s"],
        flutter_rate_hz=meta["flutter_rate_hz"],
        flutter_depth=meta["flutter_depth_s"],
        drift_vel_pp=meta["drift_vel_pp"],
    )

    meta.update(
        tempo=tempo_val,
        subkick_enabled=subkick_enabled,
        split_stems=split_stems,
    )

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
                result[i]["tomh" if progress < 0.5 else "toml"] = int(
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
