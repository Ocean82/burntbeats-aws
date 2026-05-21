"""
Generate test fixture WAV files for midi_service integration tests.

Usage:
    python -m midi_service.tests.generate_fixtures

Or run directly:
    python midi_service/tests/generate_fixtures.py

Generates:
    midi_service/tests/fixtures/piano_c_major.wav
        5-second C major scale (C4, D4, E4, F4, G4 — each note 1 second)
        as sine waves at 44100 Hz sample rate, 16-bit PCM.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_RATE = 44100


def _sine_tone(frequency: float, duration: float, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Generate a sine wave tone with a gentle fade-in/out to avoid clicks."""
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    wave = 0.7 * np.sin(2 * np.pi * frequency * t)

    # Apply 10ms fade-in and fade-out to avoid clicks
    fade_samples = int(0.01 * sample_rate)
    fade_in = np.linspace(0, 1, fade_samples)
    fade_out = np.linspace(1, 0, fade_samples)
    wave[:fade_samples] *= fade_in
    wave[-fade_samples:] *= fade_out

    return wave.astype(np.float32)


def generate_piano_c_major() -> Path:
    """Generate a 5-second C major scale: C4, D4, E4, F4, G4 (1 second each)."""
    # Frequencies for C4, D4, E4, F4, G4
    notes = [261.63, 293.66, 329.63, 349.23, 392.00]
    duration_per_note = 1.0

    segments = [_sine_tone(freq, duration_per_note) for freq in notes]
    audio = np.concatenate(segments)

    output_path = FIXTURES_DIR / "piano_c_major.wav"
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), audio, SAMPLE_RATE, subtype="PCM_16")

    print(f"Generated: {output_path} ({len(audio) / SAMPLE_RATE:.1f}s, {SAMPLE_RATE}Hz)")
    return output_path


if __name__ == "__main__":
    generate_piano_c_major()
    print("All fixtures generated.")
