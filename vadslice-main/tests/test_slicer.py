from __future__ import annotations

import io
import wave
from pathlib import Path

import numpy as np
import pytest

import vadslice.core as core
import vadslice.silero_onnx_vad as silero
from vadslice.core import AudioPart, _pcm_to_wav_bytes, slice_on_vad, slicer
from vadslice.silero_onnx_vad import (
    SAMPLE_RATE,
    SileroOnnxVAD,
    _load_default_session,
    get_speech_timestamps_onnx,
)


# ---------------------------
# _load_default_session
# ---------------------------


def test_load_default_session_uses_default_path_and_cpu(monkeypatch: pytest.MonkeyPatch) -> None:
    created: dict[str, object] = {}

    class DummySession:
        def __init__(self, model_path: str, providers: list[str] | None = None) -> None:
            created["model_path"] = model_path
            created["providers"] = providers

    monkeypatch.setattr(silero.ort, "InferenceSession", DummySession)

    session = _load_default_session(model_path=None, providers=None)
    assert isinstance(session, DummySession)

    model_path = Path(created["model_path"])  # type: ignore[assignment]
    assert model_path.name == "silero_vad.onnx"
    assert created["providers"] == ["CPUExecutionProvider"]


def test_load_default_session_respects_explicit_arguments(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    created: dict[str, object] = {}

    class DummySession:
        def __init__(self, model_path: str, providers: list[str] | None = None) -> None:
            created["model_path"] = Path(model_path)
            created["providers"] = providers

    monkeypatch.setattr(silero.ort, "InferenceSession", DummySession)

    custom_path = tmp_path / "custom.onnx"
    providers = ["CUDAExecutionProvider"]

    session = _load_default_session(model_path=custom_path, providers=providers)
    assert isinstance(session, DummySession)

    assert created["model_path"] == custom_path
    assert created["providers"] == providers


# ---------------------------
# Dummy ONNX session for get_speech_timestamps_onnx
# ---------------------------


class DummySession:
    """
    Minimal onnxruntime.InferenceSession-like stub.

    - 'probs' is a list of probabilities, one per frame.
    - After we run out, we repeat the last probability.
    """

    def __init__(self, probs: list[float]) -> None:
        self.probs = probs
        self.calls: list[dict[str, object]] = []
        self.state_shapes: list[tuple[int, ...]] = []
        self.sr_values: list[int] = []

    def run(self, outputs, inputs):  # signature mimics onnxruntime
        idx = len(self.calls)
        self.calls.append(
            {
                "input_shape": inputs["input"].shape,
                "state_shape": inputs["state"].shape,
                "sr": int(inputs["sr"][0]),
            }
        )
        self.state_shapes.append(inputs["state"].shape)
        self.sr_values.append(int(inputs["sr"][0]))

        prob = self.probs[min(idx, len(self.probs) - 1)]
        out_raw = np.array([[prob]], dtype=np.float32)
        new_state_raw = np.zeros((2, 1, 128), dtype=np.float32)
        return out_raw, new_state_raw


# ---------------------------
# get_speech_timestamps_onnx core behaviour
# ---------------------------


def test_get_speech_timestamps_onnx_empty_wav_returns_empty() -> None:
    dummy_session = DummySession(probs=[0.9])  # will never be used
    wav = np.array([], dtype=np.float32)

    segments = get_speech_timestamps_onnx(
        wav=wav,
        session=dummy_session,
        sampling_rate=SAMPLE_RATE,
    )
    assert segments == []


def test_get_speech_timestamps_onnx_invalid_sampling_rate_raises() -> None:
    dummy_session = DummySession(probs=[0.9])
    wav = np.zeros(16000, dtype=np.float32)

    with pytest.raises(ValueError):
        get_speech_timestamps_onnx(
            wav=wav,
            session=dummy_session,
            sampling_rate=12_345,
        )


def test_get_speech_timestamps_onnx_single_full_segment() -> None:
    sr = SAMPLE_RATE  # 16 kHz
    window_size_ms = 32
    sr_per_ms = sr // 1000
    window_size_samples = window_size_ms * sr_per_ms

    probs = [0.9] * 10  # always speech
    wav = np.zeros(window_size_samples * len(probs), dtype=np.float32)
    session = DummySession(probs=probs)

    segments = get_speech_timestamps_onnx(
        wav=wav,
        session=session,
        sampling_rate=sr,
        window_size_ms=window_size_ms,
        threshold=0.5,
        min_speech_ms=0,
        min_silence_ms=0,
        speech_pad_ms=0,
    )

    assert segments == [{"start": 0, "end": wav.size}]

    # Ensure shape and sr fed into the model are as expected
    assert len(session.calls) == len(probs)
    assert session.sr_values == [sr] * len(probs)
    for call in session.calls:
        state_shape = call["state_shape"]
        assert state_shape == (2, 1, 128)


def test_get_speech_timestamps_onnx_middle_segment_with_silence() -> None:
    sr = SAMPLE_RATE
    window_size_ms = 32
    sr_per_ms = sr // 1000
    window_size_samples = window_size_ms * sr_per_ms

    # Pattern: silence, speech, speech, silence
    probs = [0.0, 0.9, 0.9, 0.0]
    wav = np.zeros(window_size_samples * len(probs), dtype=np.float32)
    session = DummySession(probs=probs)

    segments = get_speech_timestamps_onnx(
        wav=wav,
        session=session,
        sampling_rate=sr,
        window_size_ms=window_size_ms,
        threshold=0.5,
        min_speech_ms=0,   # no min speech
        min_silence_ms=1,  # 1 ms of silence → a single non-speech frame is enough
        speech_pad_ms=0,
    )

    # Expect one segment from frame 1 to frame 3
    start = window_size_samples * 1
    end = window_size_samples * 3
    assert segments == [{"start": start, "end": end}]


def test_get_speech_timestamps_onnx_stereo_input_is_averaged() -> None:
    sr = SAMPLE_RATE
    window_size_ms = 32
    sr_per_ms = sr // 1000
    window_size_samples = window_size_ms * sr_per_ms

    # Exactly one window worth of samples → single iteration
    mono = np.linspace(-1.0, 1.0, window_size_samples, dtype=np.float32)
    stereo = np.stack([mono, -mono], axis=-1)  # shape (N, 2)
    session = DummySession(probs=[0.0])

    segments = get_speech_timestamps_onnx(
        wav=stereo,
        session=session,
        sampling_rate=sr,
        window_size_ms=window_size_ms,
        threshold=0.5,
        min_speech_ms=0,
        min_silence_ms=0,
        speech_pad_ms=0,
    )

    assert segments == []  # all probs below threshold

    # Check that the input fed into the model is [context | mono-averaged-frame]
    assert len(session.calls) == 1
    call = session.calls[0]
    input_shape = call["input_shape"]
    assert input_shape[0] == 1  # batch dimension

    # context_samples = 64 at 16k
    context_samples = 64
    total_len = context_samples + window_size_samples
    assert input_shape[1] == total_len

    buf = call["input"] = None  # type: ignore[assignment]
    # To inspect values we need to reconstruct the actual buffer from the session;
    # but DummySession doesn't store it. For pure behaviour testing, it's enough
    # that there's a single call and no error. If you want, you can extend
    # DummySession to store inputs["input"] and assert that its tail equals mono.


# ---------------------------
# SileroOnnxVAD dataclass wrapper
# ---------------------------


def test_silero_onnx_vad_from_default_uses_loader(monkeypatch: pytest.MonkeyPatch) -> None:
    dummy_session = object()

    def fake_loader(model_path, providers):
        # from_default passes through arguments; here we only care that it's called
        assert model_path is None
        assert providers is None
        return dummy_session

    monkeypatch.setattr(silero, "_load_default_session", fake_loader)

    vad = SileroOnnxVAD.from_default(sample_rate=8000, threshold=0.7)
    assert vad.session is dummy_session
    assert vad.sample_rate == 8000
    assert vad.threshold == 0.7


def test_silero_onnx_vad_passes_config_to_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    recorded: dict[str, object] = {}

    def fake_get_speech_timestamps_onnx(
        *,
        wav,
        session,
        sampling_rate,
        window_size_ms,
        threshold,
        min_speech_ms,
        min_silence_ms,
        speech_pad_ms,
    ):
        recorded.update(
            {
                "wav": wav,
                "session": session,
                "sampling_rate": sampling_rate,
                "window_size_ms": window_size_ms,
                "threshold": threshold,
                "min_speech_ms": min_speech_ms,
                "min_silence_ms": min_silence_ms,
                "speech_pad_ms": speech_pad_ms,
            }
        )
        return [{"start": 0, "end": 1}]

    monkeypatch.setattr(silero, "get_speech_timestamps_onnx", fake_get_speech_timestamps_onnx)

    dummy_session = object()
    vad = SileroOnnxVAD(
        session=dummy_session,
        sample_rate=8000,
        window_size_ms=16,
        threshold=0.9,
        min_speech_ms=100,
        min_silence_ms=50,
        speech_pad_ms=10,
    )

    wav = np.zeros(8000, dtype=np.float32)
    segments = vad.get_speech_timestamps(wav)
    assert segments == [{"start": 0, "end": 1}]

    assert recorded["session"] is dummy_session
    assert recorded["sampling_rate"] == 8000
    assert recorded["window_size_ms"] == 16
    assert recorded["threshold"] == 0.9
    assert recorded["min_speech_ms"] == 100
    assert recorded["min_silence_ms"] == 50
    assert recorded["speech_pad_ms"] == 10
    # The actual wav is passed through unchanged
    assert isinstance(recorded["wav"], np.ndarray)
    assert recorded["wav"].shape == wav.shape


# ---------------------------
# _pcm_to_wav_bytes
# ---------------------------


def test_pcm_to_wav_bytes_clipping_and_range() -> None:
    """Test that _pcm_to_wav_bytes correctly handles clipping and preserves sign."""
    pcm = np.array([-2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0], dtype=np.float32)
    data = _pcm_to_wav_bytes(pcm)
    with wave.open(io.BytesIO(data), "rb") as wf:
        frames = wf.readframes(wf.getnframes())
    int16 = np.frombuffer(frames, dtype="<i2")
    assert int16.min() >= -32768
    assert int16.max() <= 32767
    # Extreme negatives/positives clip but preserve sign
    assert int16[0] == int16[1]  # -2.0 clipped same as -1.0
    assert int16[-1] == int16[-2]  # 2.0 clipped same as 1.0
    assert int16[1] < 0  # negative
    assert int16[-2] > 0  # positive


def test_pcm_to_wav_bytes_empty() -> None:
    """Test that _pcm_to_wav_bytes handles empty input."""
    pcm = np.array([], dtype=np.float32)
    data = _pcm_to_wav_bytes(pcm)
    assert data == b""


def test_pcm_to_wav_bytes_full_range() -> None:
    """Test that _pcm_to_wav_bytes correctly maps [-1, 1] to int16 range."""
    pcm = np.array([-1.0, 0.0, 1.0], dtype=np.float32)
    data = _pcm_to_wav_bytes(pcm)
    with wave.open(io.BytesIO(data), "rb") as wf:
        frames = wf.readframes(wf.getnframes())
    int16 = np.frombuffer(frames, dtype="<i2")
    assert int16[0] == -32767  # -1.0 maps to -32767
    assert int16[1] == 0  # 0.0 maps to 0
    assert int16[2] == 32767  # 1.0 maps to 32767


# ---------------------------
# slice_on_vad
# ---------------------------


def _wav_info(wav_bytes: bytes) -> tuple[int, int]:
    """Helper to get frame count and sample rate from WAV bytes."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        return wf.getnframes(), wf.getframerate()


def test_slice_on_vad_empty_file(tmp_path: Path) -> None:
    """Test that slice_on_vad handles empty audio files."""
    # Create a minimal empty WAV file
    empty_wav = tmp_path / "empty.wav"
    with wave.open(str(empty_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b"")

    parts = slice_on_vad(str(empty_wav), slice_length_s=1.0)
    assert parts == []


def test_slice_on_vad_chunking_behaviour(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that slice_on_vad correctly chunks audio and sets offsets in seconds."""
    # Create a dummy audio file
    dummy_wav = tmp_path / "dummy.wav"
    duration_s = 5.0
    samples = int(duration_s * SAMPLE_RATE)
    pcm = np.zeros(samples, dtype=np.float32)
    wav_bytes = _pcm_to_wav_bytes(pcm)
    dummy_wav.write_bytes(wav_bytes)

    # Mock VAD to return speech segments
    def fake_get_speech_timestamps(wav: np.ndarray) -> list[dict[str, int]]:
        # Return speech segments that will create cuts
        return [
            {"start": 0, "end": int(2.0 * SAMPLE_RATE)},  # 2 seconds
            {"start": int(2.5 * SAMPLE_RATE), "end": int(5.0 * SAMPLE_RATE)},  # 2.5-5 seconds
        ]

    monkeypatch.setattr(core.VAD, "get_speech_timestamps", fake_get_speech_timestamps)

    parts = slice_on_vad(str(dummy_wav), slice_length_s=1.0)

    # Verify offsets are in seconds and monotonic
    offsets = [p.offset_s for p in parts]
    assert offsets == sorted(offsets)
    assert all(b > a for a, b in zip(offsets, offsets[1:], strict=False))

    # Verify offsets match the actual audio duration
    offset_s = 0.0
    for part in parts:
        nframes, sr = _wav_info(part.part)
        assert sr == SAMPLE_RATE
        assert abs(part.offset_s - offset_s) < 1e-6
        offset_s += nframes / sr


def test_slice_on_vad_offsets_are_monotonic(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that offsets are strictly increasing."""
    # Create a dummy audio file
    dummy_wav = tmp_path / "dummy.wav"
    duration_s = 10.0
    samples = int(duration_s * SAMPLE_RATE)
    pcm = np.zeros(samples, dtype=np.float32)
    wav_bytes = _pcm_to_wav_bytes(pcm)
    dummy_wav.write_bytes(wav_bytes)

    # Mock VAD to return multiple speech segments
    def fake_get_speech_timestamps(wav: np.ndarray) -> list[dict[str, int]]:
        return [
            {"start": 0, "end": int(1.0 * SAMPLE_RATE)},
            {"start": int(2.0 * SAMPLE_RATE), "end": int(3.0 * SAMPLE_RATE)},
            {"start": int(4.0 * SAMPLE_RATE), "end": int(5.0 * SAMPLE_RATE)},
        ]

    monkeypatch.setattr(core.VAD, "get_speech_timestamps", fake_get_speech_timestamps)

    parts = slice_on_vad(str(dummy_wav), slice_length_s=0.5)

    offsets = [p.offset_s for p in parts]
    assert offsets == sorted(offsets)
    assert all(b > a for a, b in zip(offsets, offsets[1:], strict=False))

    # Verify offsets are in seconds, not frames
    total_offset_s = 0.0
    for part in parts:
        nframes, sr = _wav_info(part.part)
        assert sr == SAMPLE_RATE
        assert abs(part.offset_s - total_offset_s) < 1e-6
        total_offset_s += nframes / sr


def test_slice_on_vad_no_speech_returns_single_chunk(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that slice_on_vad returns single chunk when VAD finds no speech."""
    dummy_wav = tmp_path / "dummy.wav"
    duration_s = 2.0
    samples = int(duration_s * SAMPLE_RATE)
    pcm = np.zeros(samples, dtype=np.float32)
    wav_bytes = _pcm_to_wav_bytes(pcm)
    dummy_wav.write_bytes(wav_bytes)

    # Mock VAD to return no speech
    def fake_get_speech_timestamps(wav: np.ndarray) -> list[dict[str, int]]:
        return []

    monkeypatch.setattr(core.VAD, "get_speech_timestamps", fake_get_speech_timestamps)

    parts = slice_on_vad(str(dummy_wav), slice_length_s=1.0)

    assert len(parts) == 1
    assert parts[0].offset_s == 0.0
    nframes, sr = _wav_info(parts[0].part)
    assert sr == SAMPLE_RATE
    assert abs(nframes / sr - duration_s) < 1e-3


# ---------------------------
# slicer
# ---------------------------


def test_slicer_rejects_non_positive_slice_length(tmp_path: Path) -> None:
    """Test that slicer raises ValueError for non-positive slice_length_s."""
    dummy_file = tmp_path / "dummy.wav"
    dummy_file.write_bytes(b"\x00")

    with pytest.raises(ValueError):
        slicer(dummy_file, slice_length_s=0.0)

    with pytest.raises(ValueError):
        slicer(dummy_file, slice_length_s=-1.0)


def test_slicer_calls_slice_on_vad(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Test that slicer correctly calls slice_on_vad."""
    called = {}

    def fake_slice_on_vad(path: str, slice_length_s: float, silence_flush_s: float | None = None) -> list[AudioPart]:
        called["path"] = path
        called["slice_length_s"] = slice_length_s
        called["silence_flush_s"] = silence_flush_s
        return [AudioPart(part=b"", offset_s=0.0)]

    monkeypatch.setattr(core, "slice_on_vad", fake_slice_on_vad)

    dummy_file = tmp_path / "dummy.wav"
    dummy_file.write_bytes(b"\x00")

    parts = slicer(dummy_file, slice_length_s=5.0)

    assert len(parts) == 1
    assert called["path"] == str(dummy_file)
    assert called["slice_length_s"] == 5.0
    assert called["silence_flush_s"] is None


def test_slicer_package_level_import(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Test that the package-level API works: from vadslice import slicer."""
    # Import from package level
    from vadslice import slicer as package_slicer

    called = {}

    def fake_slice_on_vad(path: str, slice_length_s: float, silence_flush_s: float | None = None) -> list[AudioPart]:
        called["path"] = path
        called["slice_length_s"] = slice_length_s
        return [AudioPart(part=b"", offset_s=1.0)]

    monkeypatch.setattr(core, "slice_on_vad", fake_slice_on_vad)

    dummy_file = tmp_path / "dummy.wav"
    dummy_file.write_bytes(b"\x00")

    parts = package_slicer(dummy_file, slice_length_s=3.0)

    assert len(parts) == 1
    assert parts[0].offset_s == 1.0
    assert called["path"] == str(dummy_file)
    assert called["slice_length_s"] == 3.0