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

from __future__ import annotations

import shutil
from typing import Tuple

import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, PitchShift  # type: ignore


def _normalize_pedalboard_output(
    result: np.ndarray,
    *,
    expect_mono: bool,
) -> np.ndarray:
    """
    Normalize Pedalboard output to this module's shape contract.

    - expect_mono=True  -> returns (samples,)
    - expect_mono=False -> returns (channels, samples)
    """
    arr = np.asarray(result)

    if expect_mono:
        if arr.ndim == 1:
            return arr
        if arr.ndim == 2 and arr.shape[0] == 1:
            return arr[0]
        raise ValueError(
            "Unexpected mono output shape from Pedalboard; expected 1D or (1, samples), "
            f"got {arr.shape!r}",
        )

    if arr.ndim != 2:
        raise ValueError(
            "Unexpected multichannel output shape from Pedalboard; expected (channels, samples), "
            f"got {arr.shape!r}",
        )
    return arr


def pitch_shift_array(
    audio: np.ndarray,
    sample_rate: int,
    semitones: float,
) -> Tuple[np.ndarray, int]:
    """
    Apply time-preserving pitch shift to a numpy audio array.

    Args:
        audio:
            Float32 numpy array with shape:
              - (samples,) for mono
              - (channels, samples) for multichannel
        sample_rate:
            Sample rate in Hz.
        semitones:
            Semitones to shift. Positive = up, negative = down.

    Returns:
        Tuple of (shifted_audio, sample_rate).
        Output has the same shape convention as the input.
    """

    # --- Validation ---------------------------------------------------------
    if audio.size == 0:
        raise ValueError("Audio array is empty")

    if audio.ndim not in (1, 2):
        raise ValueError("Audio must be 1D (mono) or 2D (channels, samples)")

    if not isinstance(sample_rate, (int, np.integer)) or sample_rate <= 0:
        raise ValueError("Sample rate must be a positive integer")

    if not np.isfinite(semitones):
        raise ValueError("Semitones must be a finite number")

    # --- No-op --------------------------------------------------------------
    if semitones == 0:
        return audio, sample_rate

    # --- Prepare audio for Pedalboard --------------------------------------
    board = Pedalboard([PitchShift(semitones=semitones)])

    # Pedalboard expects (channels, samples), float32
    if audio.ndim == 1:
        audio_ch_first = audio[np.newaxis, :].astype(np.float32)
        result = board(audio_ch_first, sample_rate)
        shifted = _normalize_pedalboard_output(result, expect_mono=True)
    else:
        audio_ch_first = audio.astype(np.float32)
        result = board(audio_ch_first, sample_rate)
        shifted = _normalize_pedalboard_output(result, expect_mono=False)

    return shifted, sample_rate


def pitch_shift_file(
    input_path: str,
    output_path: str,
    semitones: float,
) -> None:
    """
    Read an audio file, pitch-shift it, and write to output_path.

    Args:
        input_path:
            Path to source audio file (WAV, FLAC, etc.).
        output_path:
            Path to write the shifted audio.
        semitones:
            Semitones to shift.

    Notes:
        - Input files read by soundfile may be shaped as:
            (samples,) or (samples, channels)
        - Internally, audio is converted to (channels, samples)
        - Output is written in soundfile's expected format:
            (samples,) or (samples, channels)
    """

    # --- No-op shortcut -----------------------------------------------------
    if semitones == 0:
        if input_path != output_path:
            shutil.copy2(input_path, output_path)
        return

    # --- Read audio ---------------------------------------------------------
    audio, sr = sf.read(
        input_path,
        dtype="float32",
        always_2d=False,
    )

    # Convert (samples, channels) -> (channels, samples) if needed
    if audio.ndim == 2:
        audio_ch_first = np.moveaxis(audio, 1, 0)
    else:
        audio_ch_first = audio

    # --- Pitch shift --------------------------------------------------------
    shifted, _ = pitch_shift_array(audio_ch_first, sr, semitones)

    # Convert back to soundfile layout: (samples, channels)
    if shifted.ndim == 2:
        shifted_out = np.moveaxis(shifted, 0, 1)
    else:
        shifted_out = shifted

    # --- Write output -------------------------------------------------------
    sf.write(output_path, shifted_out, sr)
