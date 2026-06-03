from __future__ import annotations

import sys
import types

from midi_service.services import model_runtime


def test_get_model_path_caches_onnx_model_path(monkeypatch, tmp_path):
    onnx_file = tmp_path / "nmp.onnx"
    onnx_file.write_bytes(b"fake")

    class FakeSuffix:
        onnx = "onnx"

    fake_basic_pitch = types.SimpleNamespace(
        FilenameSuffix=FakeSuffix,
        build_icassp_2022_model_path=lambda suffix: onnx_file,
    )
    monkeypatch.setitem(sys.modules, "basic_pitch", fake_basic_pitch)
    monkeypatch.setattr(model_runtime, "_model_path", None)

    first = model_runtime.get_model_path()
    second = model_runtime.get_model_path()

    assert first == onnx_file
    assert second == onnx_file
