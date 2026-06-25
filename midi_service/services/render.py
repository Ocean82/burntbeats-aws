"""MIDI-to-audio render pipeline.

Renders MIDI note data or an existing .mid file to WAV/MP3 using FluidSynth.
Integrates with the existing job queue for async processing with progress tracking.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
import time
import wave
from pathlib import Path
from typing import Any

from midi_service.config import DEFAULT_SOUNDFONT, MIDI_OUTPUT_DIR, SOUNDFONT_DIR
from midi_service.job_queue import is_job_cancelled
from midi_service.services.storage import (
    OUTPUT_FILENAME,
    safe_job_path,
    write_metadata,
    write_progress,
)

logger = logging.getLogger(__name__)

RENDER_OUTPUT_FILENAME = "render.wav"
RENDER_MP3_FILENAME = "render.mp3"


def resolve_soundfont(soundfont_name: str | None = None) -> Path:
    """Locate a .sf2/.sf3 soundfont file in the configured directory."""
    name = soundfont_name or DEFAULT_SOUNDFONT
    if not name:
        raise ValueError("No soundfont configured")

    sf_dir = SOUNDFONT_DIR
    supplied = Path(name)

    candidates: list[Path] = []
    if supplied.is_absolute():
        candidates.append(supplied)
    else:
        candidates.append(sf_dir / supplied)
        if supplied.suffix.lower() not in {".sf2", ".sf3"}:
            candidates.append(sf_dir / f"{name}.sf2")
            candidates.append(sf_dir / f"{name}.sf3")

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    raise ValueError(
        f"SoundFont not found: {name}. " f"Place .sf2/.sf3 files in {sf_dir}"
    )


def find_existing_midi(job_id: str) -> Path:
    """Locate the .mid output from a completed conversion job."""
    job_dir = safe_job_path(MIDI_OUTPUT_DIR, job_id)
    if not job_dir.is_dir():
        raise FileNotFoundError(f"MIDI job directory not found: {job_id}")

    # Check standard output filename first
    standard = job_dir / OUTPUT_FILENAME
    if standard.exists():
        return standard

    # Fallback: find any .mid file
    mid_files = sorted(job_dir.glob("*.mid")) + sorted(job_dir.glob("*.midi"))
    if mid_files:
        return mid_files[0]

    raise FileNotFoundError(f"No MIDI file found for job {job_id}")


def build_midi_from_notes(
    notes: list[dict[str, Any]],
    bpm: float,
    instrument: int = 0,
    tracks: list[dict[str, Any]] | None = None,
    dest: Path | None = None,
) -> Path:
    """Create a standard MIDI file from raw note data (no external deps)."""
    if dest is None:
        dest = Path(tempfile.mktemp(suffix=".mid"))

    ticks_per_beat = 480
    tempo_us = int(60_000_000 / bpm)

    # Collect all MIDI events as (tick, bytes)
    events: list[tuple[int, bytes]] = []

    # Tempo meta event
    events.append((0, b"\xff\x51\x03" + tempo_us.to_bytes(3, "big")))

    # Channel setup: program change, volume, pan
    channel_settings: dict[int, dict[str, Any]] = {}
    for idx, tr in enumerate(tracks or []):
        ch = tr.get("channel", min(idx, 15))
        channel_settings[ch] = tr

    for ch in range(16):
        if ch == 9:  # GM percussion — skip program change
            continue
        tr = channel_settings.get(ch)
        program = (
            tr.get("instrument")
            if tr and tr.get("instrument") is not None
            else instrument
        )
        events.append((0, bytes([0xC0 | ch, program])))
        if tr and tr.get("volume") is not None:
            vol = max(0, min(127, round(tr["volume"] * 127)))
            events.append((0, bytes([0xB0 | ch, 7, vol])))
        if tr and tr.get("pan") is not None:
            events.append((0, bytes([0xB0 | ch, 10, tr["pan"]])))

    # Convert note events (seconds-based) to MIDI ticks
    ticks_per_second = ticks_per_beat * bpm / 60.0
    for note in notes:
        start_tick = round(note["start"] * ticks_per_second)
        end_tick = round((note["start"] + note["duration"]) * ticks_per_second)
        ch = note.get("channel", 0)
        pitch = note["pitch"]
        velocity = note.get("velocity", 100)
        events.append((start_tick, bytes([0x90 | ch, pitch, velocity])))
        events.append((max(end_tick, start_tick + 1), bytes([0x80 | ch, pitch, 0])))

    # Sort by tick, note-offs after note-ons at same tick
    events.sort(key=lambda item: (item[0], 0 if (item[1][0] & 0xF0) != 0x80 else 1))

    # Encode track data with variable-length delta times
    track_data = bytearray()
    last_tick = 0
    for tick, data in events:
        delta = max(0, tick - last_tick)
        track_data.extend(_encode_varlen(delta))
        track_data.extend(data)
        last_tick = tick
    # End of track
    track_data.extend(b"\x00\xff\x2f\x00")

    # Write SMF
    header = (
        b"MThd"
        + (6).to_bytes(4, "big")
        + (0).to_bytes(2, "big")  # format 0
        + (1).to_bytes(2, "big")  # 1 track
        + ticks_per_beat.to_bytes(2, "big")
    )
    chunk = b"MTrk" + len(track_data).to_bytes(4, "big") + bytes(track_data)
    dest.write_bytes(header + chunk)
    return dest


def remap_midi_instruments(
    source: Path,
    instrument: int | None,
    tracks: list[dict[str, Any]] | None,
    dest: Path,
) -> Path:
    """Inject instrument/volume/pan changes into an existing MIDI file."""
    import mido

    if not tracks and instrument is None:
        return source

    mid = mido.MidiFile(str(source))
    channels: dict[int, dict[str, Any]] = {}
    for idx, tr in enumerate(tracks or []):
        ch = tr.get("channel", min(idx, 15))
        channels[ch] = tr

    # Insert control messages at the beginning of the first track
    for track in mid.tracks:
        inserts = []
        if instrument is not None:
            for ch in range(16):
                if ch != 9:
                    inserts.append(
                        mido.Message(
                            "program_change", program=instrument, channel=ch, time=0
                        )
                    )
        for ch, tr in channels.items():
            if tr.get("instrument") is not None:
                inserts.append(
                    mido.Message(
                        "program_change", program=tr["instrument"], channel=ch, time=0
                    )
                )
            if tr.get("volume") is not None:
                vol = max(0, min(127, round(tr["volume"] * 127)))
                inserts.append(
                    mido.Message(
                        "control_change", control=7, value=vol, channel=ch, time=0
                    )
                )
            if tr.get("pan") is not None:
                inserts.append(
                    mido.Message(
                        "control_change",
                        control=10,
                        value=tr["pan"],
                        channel=ch,
                        time=0,
                    )
                )
        if inserts:
            track[0:0] = inserts
            break

    mid.save(str(dest))
    return dest


def render_midi_to_wav(
    midi_path: Path,
    soundfont_path: Path,
    wav_path: Path,
    sample_rate: int = 44100,
    master_gain: float = 1.0,
) -> None:
    """Render MIDI to WAV using the FluidSynth CLI."""
    if shutil.which("fluidsynth") is None:
        raise RuntimeError(
            "fluidsynth is not installed. "
            "Add 'fluidsynth' to the Dockerfile apt-get install."
        )

    cmd = [
        "fluidsynth",
        "-ni",
        "-g",
        str(master_gain),
        "-F",
        str(wav_path),
        "-r",
        str(sample_rate),
        str(soundfont_path),
        str(midi_path),
    ]

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=300,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"FluidSynth failed (exit {result.returncode}): "
            f"{result.stderr.strip() or result.stdout.strip()}"
        )


def normalize_wav(path: Path) -> None:
    """Peak-normalize a 16-bit PCM WAV file in-place."""
    import array
    import sys

    with wave.open(str(path), "rb") as src:
        params = src.getparams()
        frames = src.readframes(src.getnframes())

    if params.sampwidth != 2 or not frames:
        return

    samples = array.array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()

    peak = max(abs(s) for s in samples) if samples else 0
    if peak <= 0:
        return

    gain = 32767.0 / peak * 0.98
    for i, s in enumerate(samples):
        samples[i] = max(-32768, min(32767, int(s * gain)))

    if sys.byteorder != "little":
        samples.byteswap()

    with wave.open(str(path), "wb") as dst:
        dst.setparams(params)
        dst.writeframes(samples.tobytes())


def encode_mp3(wav_path: Path, mp3_path: Path) -> None:
    """Encode WAV to MP3 using the lame CLI."""
    if shutil.which("lame") is None:
        raise RuntimeError(
            "lame is not installed. " "Add 'lame' to the Dockerfile apt-get install."
        )

    cmd = ["lame", "--quiet", "-V2", str(wav_path), str(mp3_path)]
    result = subprocess.run(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"LAME encoding failed: {result.stderr.strip()}")


def run_render_sync(
    job_id: str,
    input_path: Path,  # unused placeholder (job queue signature compat)
    out_dir: Path,
    options: dict[str, Any],
) -> None:
    """Main render pipeline — called by the job queue worker."""
    job_log = logging.getLogger(f"midi.render.{job_id}")
    t_start = time.perf_counter()

    write_progress(
        out_dir,
        {
            "status": "processing",
            "job_id": job_id,
            "progress": 5,
            "message": "Resolving SoundFont",
        },
    )

    soundfont_name = options.get("soundfont")
    soundfont_path = resolve_soundfont(soundfont_name)
    job_log.info("Using soundfont: %s", soundfont_path.name)

    if is_job_cancelled(job_id):
        raise RuntimeError("Job cancelled")

    write_progress(
        out_dir,
        {
            "status": "processing",
            "job_id": job_id,
            "progress": 15,
            "message": "Preparing MIDI data",
        },
    )

    tmpdir = Path(tempfile.mkdtemp(prefix="render_", dir=str(out_dir)))
    try:
        # Resolve MIDI source
        source_job_id = options.get("source_job_id")
        notes = options.get("notes")
        bpm = float(options.get("bpm", 120))
        instrument = options.get("instrument")
        tracks = options.get("tracks") or []

        if source_job_id:
            source_midi = find_existing_midi(source_job_id)
            midi_path = remap_midi_instruments(
                source_midi, instrument, tracks, tmpdir / "remapped.mid"
            )
        elif notes:
            midi_path = build_midi_from_notes(
                notes, bpm, instrument or 0, tracks, tmpdir / "notes.mid"
            )
        else:
            raise ValueError("Either source_job_id or notes must be provided")

        if is_job_cancelled(job_id):
            raise RuntimeError("Job cancelled")

        write_progress(
            out_dir,
            {
                "status": "processing",
                "job_id": job_id,
                "progress": 35,
                "message": "Rendering audio via FluidSynth",
            },
        )

        sample_rate = int(options.get("sample_rate", 44100))
        master_gain = float(options.get("master_gain", 1.0))
        wav_path = out_dir / RENDER_OUTPUT_FILENAME

        render_midi_to_wav(
            midi_path, soundfont_path, wav_path, sample_rate, master_gain
        )

        if is_job_cancelled(job_id):
            raise RuntimeError("Job cancelled")

        # Normalize
        fmt = options.get("format", "wav")
        do_normalize = bool(options.get("normalize", False))
        if do_normalize:
            write_progress(
                out_dir,
                {
                    "status": "processing",
                    "job_id": job_id,
                    "progress": 75,
                    "message": "Normalizing audio",
                },
            )
            normalize_wav(wav_path)

        # Encode MP3 if requested
        final_filename = RENDER_OUTPUT_FILENAME
        if fmt == "mp3":
            write_progress(
                out_dir,
                {
                    "status": "processing",
                    "job_id": job_id,
                    "progress": 88,
                    "message": "Encoding MP3",
                },
            )
            mp3_path = out_dir / RENDER_MP3_FILENAME
            encode_mp3(wav_path, mp3_path)
            final_filename = RENDER_MP3_FILENAME

        duration = time.perf_counter() - t_start

        write_progress(
            out_dir,
            {
                "status": "completed",
                "job_id": job_id,
                "progress": 100,
                "message": "Render complete",
                "result": {
                    "filename": final_filename,
                    "format": fmt,
                    "sample_rate": sample_rate,
                    "soundfont": soundfont_path.name,
                    "render_time_seconds": round(duration, 3),
                },
            },
        )

        write_metadata(
            out_dir,
            {
                "job_id": job_id,
                "type": "render",
                "format": fmt,
                "sample_rate": sample_rate,
                "soundfont": soundfont_path.name,
                "source_job_id": source_job_id,
                "bpm": bpm,
                "instrument": instrument,
                "normalize": do_normalize,
                "master_gain": master_gain,
                "render_time_seconds": round(duration, 3),
                "files": [final_filename],
            },
        )

        job_log.info(
            "Render job %s completed in %.2fs: %s (%s, %dHz)",
            job_id,
            duration,
            final_filename,
            fmt,
            sample_rate,
        )

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _encode_varlen(value: int) -> bytes:
    """Encode an integer as MIDI variable-length quantity."""
    buffer = value & 0x7F
    value >>= 7
    out = bytearray()
    while value:
        buffer <<= 8
        buffer |= (value & 0x7F) | 0x80
        value >>= 7
    while True:
        out.append(buffer & 0xFF)
        if buffer & 0x80:
            buffer >>= 8
        else:
            break
    return bytes(out)
