
from dataclasses import dataclass
from pathlib import Path
from typing import Dict

import numpy as np
import onnxruntime as ort

SAMPLE_RATE = 16_000


def _load_default_session(
    model_path: str | Path | None,
    providers: list[str] | None,
) -> ort.InferenceSession:
    if model_path is None:
        model_path = Path(__file__).with_name("silero_vad.onnx")
    if providers is None:
        providers = ["CPUExecutionProvider"]
    return ort.InferenceSession(str(model_path), providers=providers)


def get_speech_timestamps_onnx(
    wav: np.ndarray,
    session: ort.InferenceSession,
    sampling_rate: int = SAMPLE_RATE,
    window_size_ms: int = 32,
    threshold: float = 0.5,
    min_speech_ms: int = 250,
    min_silence_ms: int = 100,
    speech_pad_ms: int = 30,
) -> list[Dict[str, int]]:
    """
    Run Silero VAD ONNX model over a mono float32 waveform in [-1, 1].

    Returns a list of {"start": sample_idx, "end": sample_idx} in *samples*,
    similar to silero_vad.get_speech_timestamps(..., return_seconds=False).

    This uses a simple hysteresis-style algorithm:
      - 32 ms windows with a bit of "context" before each
      - start segment when prob >= threshold
      - close segment after min_silence_ms below threshold
      - drop tiny segments shorter than min_speech_ms
      - pad each segment by speech_pad_ms on both sides
    """
    wav = np.asarray(wav, dtype=np.float32)
    if wav.ndim > 1:
        wav = wav.mean(axis=-1)

    n_samples = wav.size
    if n_samples == 0:
        return []

    if sampling_rate not in (8000, 16000):
        raise ValueError("Silero VAD ONNX supports only 8 kHz or 16 kHz")

    # Window & smoothing params
    sr_per_ms = sampling_rate // 1000
    window_size_samples = window_size_ms * sr_per_ms  # 32 ms → 512 samples at 16k
    # Context used by Silero ONNX examples (more history improves decisions)
    context_samples = 64 if sampling_rate == 16000 else 32

    min_speech_samples = int(min_speech_ms * sr_per_ms)
    min_silence_samples = int(min_silence_ms * sr_per_ms)
    pad_samples = int(speech_pad_ms * sr_per_ms)

    # State tensor: Silero ONNX models use shape (2, 1, 128) for v5.
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((context_samples,), dtype=np.float32)

    triggered = False
    current_start = 0
    last_speech = 0
    silence_since = 0

    segments: list[Dict[str, int]] = []

    current = 0
    while current + window_size_samples <= n_samples:
        frame = wav[current : current + window_size_samples]

        # Build [context | frame] → shape (1, effective_window)
        buf = np.concatenate([context, frame], axis=0).astype(np.float32)
        buf_batch = buf[None, :]  # (1, T)

        inputs = {
            "input": buf_batch,  # audio
            "state": state,      # recurrent state
            "sr": np.array([sampling_rate], dtype=np.int64),
        }

        out_raw, new_state_raw = session.run(None, inputs)

        out_arr = np.asarray(out_raw, dtype=np.float32)
        prob = float(out_arr.reshape(-1)[0])

        state = np.asarray(new_state_raw, dtype=np.float32)

        context = buf[-context_samples:]

        frame_start = current
        frame_end = current + window_size_samples
        current = frame_end

        if prob >= threshold:
            # Speech detected
            if not triggered:
                triggered = True
                current_start = frame_start
            last_speech = frame_end
            silence_since = 0
        else:
            # Non-speech
            if triggered:
                silence_since += window_size_samples
                if silence_since >= min_silence_samples:
                    start = max(0, current_start - pad_samples)
                    end = min(n_samples, last_speech + pad_samples)
                    if end - start >= min_speech_samples:
                        segments.append({"start": start, "end": end})
                    triggered = False
                    silence_since = 0

    # Close final segment if we're still in speech
    if triggered:
        start = max(0, current_start - pad_samples)
        end = min(n_samples, last_speech + pad_samples)
        if end - start >= min_speech_samples:
            segments.append({"start": start, "end": end})

    return segments


@dataclass
class SileroOnnxVAD:
    """
    Small convenience wrapper around the Silero ONNX VAD model.

    Usage:
        vad = SileroOnnxVAD.from_default()
        speech_ts = vad.get_speech_timestamps(wav)
    """

    session: ort.InferenceSession
    sample_rate: int = SAMPLE_RATE
    window_size_ms: int = 32
    threshold: float = 0.5
    min_speech_ms: int = 250
    min_silence_ms: int = 100
    speech_pad_ms: int = 30

    @classmethod
    def from_default(
        cls,
        model_path: str | Path | None = None,
        providers: list[str] | None = None,
        **kwargs,
    ) -> "SileroOnnxVAD":
        session = _load_default_session(model_path, providers)
        return cls(session=session, **kwargs)

    def get_speech_timestamps(self, wav: np.ndarray) -> list[Dict[str, int]]:
        return get_speech_timestamps_onnx(
            wav=wav,
            session=self.session,
            sampling_rate=self.sample_rate,
            window_size_ms=self.window_size_ms,
            threshold=self.threshold,
            min_speech_ms=self.min_speech_ms,
            min_silence_ms=self.min_silence_ms,
            speech_pad_ms=self.speech_pad_ms,
        )
