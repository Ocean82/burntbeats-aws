"""
pitch_shift.py — Time-preserving pitch shifting for stem audio using Pedalboard.

Pedalboard's PitchShift uses a phase-vocoder algorithm, so pitch changes
without altering the duration or timing of the audio.

Usage:
    from stem_service.pitch_shift import pitch_shift_file, pitch_shift_array

    # Shift a WAV file by +3 semitones, write to output path
    pitch_shift_file("vocals.wav", "vocals_shifted.wav", semitones=3)

    # Or work with numpy arrays directly
    shifted, sr = pitch_shift_array(audio_array, sample_rate, semitones=-2)
"""

import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, PitchShift  # type: ignore


def pitch_shift_array(
    audio: np.ndarray,
    sample_rate: int,
    semitones: float,
) -> tuple[np.ndarray, int]:
    """
    Apply time-preserving pitch shift to a numpy audio array.

    Args:
        audio:       Float32 numpy array, shape (samples,) or (channels, samples).
        sample_rate: Sample rate in Hz.
        semitones:   Semitones to shift. Positive = up, negative = down.

    Returns:
        Tuple of (shifted_audio, sample_rate). Same shape as input.
    """
    if semitones == 0:
        return audio, sample_rate

    board = Pedalboard([PitchShift(semitones=semitones)])

    # Pedalboard expects (channels, samples) float32
    if audio.ndim == 1:
        audio_2d = audio[np.newaxis, :].astype(np.float32)
        result = board(audio_2d, sample_rate)
        return result[0], sample_rate
    else:
        result = board(audio.astype(np.float32), sample_rate)
        return result, sample_rate


def pitch_shift_file(
    input_path: str,
    output_path: str,
    semitones: float,
) -> None:
    """
    Read an audio file, pitch-shift it, and write to output_path.

    Args:
        input_path:  Path to source audio file (WAV, FLAC, etc.).
        output_path: Path to write the shifted audio.
        semitones:   Semitones to shift.
    """
    if semitones == 0:
        # No-op: just copy if paths differ
        if input_path != output_path:
            import shutil
            shutil.copy2(input_path, output_path)
        return

    audio, sr = sf.read(input_path, dtype="float32", always_2d=False)
    shifted, _ = pitch_shift_array(audio, sr, semitones)
    sf.write(output_path, shifted.T if shifted.ndim == 2 else shifted, sr)
