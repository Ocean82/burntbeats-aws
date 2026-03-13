from __future__ import annotations

import io
import wave
from typing import TYPE_CHECKING, NamedTuple

import av
import numpy as np
from loguru import logger
from .silero_onnx_vad import SileroOnnxVAD


class AudioPart(NamedTuple):
    """Represents a slice of audio data with its offset in seconds."""

    # Audio data as 16 kHz WAV bytes for that slice
    part: bytes
    # Start time offset in seconds from the beginning of the original audio file
    offset_s: float


if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

SAMPLE_RATE = 16_000

VAD = SileroOnnxVAD.from_default()


def _pcm_to_wav_bytes(pcm: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    """
    pcm: 1D float32 array in [-1, 1], mono.
    Returns: 16-bit PCM mono WAV bytes.
    """
    pcm = np.asarray(pcm, dtype=np.float32)
    if pcm.size == 0:
        return b""

    pcm = np.clip(pcm, -1.0, 1.0)
    int16 = (pcm * 32767.0).astype("<i2")  # little-endian int16

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(int16.tobytes())
    return buf.getvalue()


def _iter_resampled_pcm(
    path: str, sample_rate: int = SAMPLE_RATE
) -> Iterator[np.ndarray]:
    """
    Stream audio from `path`, resampled to mono `sample_rate`, as float32 [-1, 1] chunks.
    Uses PyAV's high-level decode + AudioResampler.
    """
    with av.open(path) as container:
        # First audio stream
        audio_stream = next((s for s in container.streams if s.type == "audio"), None)
        if audio_stream is None:
            raise ValueError("No audio streams found")

        # ------------ For ffmpeg multithreading -------
        # ctx = audio_stream.codec_context
        # ctx.thread_type = "AUTO"
        # ctx.thread_count = 0       
        # -----------------------------------------------

        # Resample to mono 16k, 16-bit PCM
        resampler = av.AudioResampler(format="s16", layout="mono", rate=sample_rate)

        # Decode and resample frames
        for frame in container.decode(audio_stream):
            for out_frame in resampler.resample(frame):  # type: ignore[attr-defined]
                pcm = out_frame.to_ndarray()

                # Shape is (channels, samples) or (samples,)
                if pcm.ndim == 2:
                    pcm = pcm[0]  # mono

                yield pcm.astype(np.float32) / 32768.0

        # Flush resampler
        for out_frame in resampler.resample(None):
            pcm = out_frame.to_ndarray()
            if pcm.ndim == 2:
                pcm = pcm[0]
            yield pcm.astype(np.float32) / 32768.0



def _load_resampled_pcm(path: str, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """
    Decode / resample the whole file into a single mono float32 array in [-1, 1].

    This trades a bit more RAM for much less Python overhead.
    """
    chunks: list[np.ndarray] = []
    for pcm_chunk in _iter_resampled_pcm(path, sample_rate):
        if pcm_chunk.size:
            chunks.append(pcm_chunk)

    if not chunks:
        return np.empty(0, dtype=np.float32)
    return np.concatenate(chunks)



def slice_on_vad(path: str, slice_length_s: float, silence_flush_s: float | None = None) -> list[AudioPart]:
    """
    Slice audio using Silero VAD (batch mode).

    - Decodes/resamples entire file to 16 kHz mono.

    - Runs get_speech_timestamps (ONNX backend).

    - Creates slices that only cut on "end of speech" boundaries,

      and are at least `slice_length_s` long (except the last).

    Returns:
        List[AudioPart], where:
          - part: mono 16 kHz WAV bytes for that slice
          - offset: start time in seconds (float) in the resampled audio
    """
    # Load full resampled PCM once
    wav = _load_resampled_pcm(path, SAMPLE_RATE)
    if wav.size == 0:
        return []

    target_samples = int(slice_length_s * SAMPLE_RATE)
    silence_flush_samples = int(silence_flush_s * SAMPLE_RATE) if silence_flush_s is not None else None

    # Use custom ONNX helper.
    speech_ts = VAD.get_speech_timestamps(wav)

    # If VAD finds nothing (pure silence / noise), just return the whole thing as one chunk.
    if not speech_ts:
        return [AudioPart(part=_pcm_to_wav_bytes(wav), offset_s=0.0)]  # seconds

    # Build cut points on "end of speech" boundaries
    cuts: list[int] = []
    chunk_start = 0  # global sample index of current logical chunk start
    for i, seg in enumerate(speech_ts):
        # seg is {"start": int, "end": int}
        speech_end = int(seg["end"])

        # Original condition: chunk is long enough
        length_met = speech_end - chunk_start >= target_samples

        # Silence gap before this segment exceeds threshold → flush at previous speech end
        silence_met = (
            silence_flush_samples is not None
            and i > 0
            and int(seg["start"]) - int(speech_ts[i - 1]["end"]) >= silence_flush_samples
        )

        if silence_met and not length_met:
            cut_point = int(speech_ts[i - 1]["end"])
            cuts.append(cut_point)
            chunk_start = cut_point
        elif length_met:
            cuts.append(speech_end)
            chunk_start = speech_end

    parts: list[AudioPart] = []
    last_cut = 0
    # Emit chunks between cut points
    for cut in cuts:
        if cut > last_cut:
            part_pcm = wav[last_cut:cut]
            parts.append(
                AudioPart(
                    part=_pcm_to_wav_bytes(part_pcm),
                    offset_s=last_cut / SAMPLE_RATE,  # seconds
                )
            )
            last_cut = cut

    # Final tail (speech + trailing silence) as last chunk
    if last_cut < wav.size:
        part_pcm = wav[last_cut:]
        parts.append(
            AudioPart(
                part=_pcm_to_wav_bytes(part_pcm),
                offset_s=last_cut / SAMPLE_RATE,  # seconds
            )
        )

    return parts


def slicer(file_path: str | Path, slice_length_s: float, silence_flush_s: float | None = None) -> list[AudioPart]:
    """
    Synchronous wrapper for slice_on_vad.

    Args:
        file_path: Path to the audio file to process.
        slice_length_s: Minimum length in seconds for each audio slice.

    Returns:
        List of AudioPart objects containing sliced audio segments.
    """
    if slice_length_s <= 0:
        raise ValueError("slice_length_s must be positive")

    path_str = str(file_path)
    logger.debug(f"Processing audio file with VAD (ONNX, batch): {path_str}")

    parts = slice_on_vad(path_str, slice_length_s, silence_flush_s)

    logger.info(
        f"Processed audio file with VAD: {path_str}, created {len(parts)} part(s)"
    )
    return parts
