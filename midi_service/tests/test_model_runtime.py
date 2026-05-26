from __future__ import annotations

import sys
import types

from midi_service.services import model_runtime


def test_get_model_path_caches_basic_pitch_model_path(monkeypatch):
    fake_basic_pitch = types.SimpleNamespace(
        ICASSP_2022_MODEL_PATH="/models/basic-pitch.onnx"
    )
    monkeypatch.setitem(sys.modules, "basic_pitch", fake_basic_pitch)
    monkeypatch.setattr(model_runtime, "_model_path", None)

    first = model_runtime.get_model_path()
    second = model_runtime.get_model_path()

    assert first == "/models/basic-pitch.onnx"
    assert second == "/models/basic-pitch.onnx"
