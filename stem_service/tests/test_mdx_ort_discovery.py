"""ORT-only under models_by_type/ort/ must resolve (server_models deploy layout)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_vocal_resolves_from_typed_ort_without_onnx_sibling(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    ort_dir = tmp_path / "models_by_type" / "ort"
    ort_dir.mkdir(parents=True)
    ort_file = ort_dir / "UVR_MDXNET_3_9662.ort"
    ort_file.write_bytes(b"ort")

    import stem_service.mdx.model_registry as registry_mod

    def resolve_in_tmp(name: str) -> Path:
        direct = tmp_path / name
        if direct.is_file():
            return direct
        ext = Path(name).suffix.lower()
        sub = "onnx" if name.endswith(".onnx.data") else ("ort" if ext == ".ort" else "onnx")
        typed = tmp_path / "models_by_type" / sub / name
        if typed.is_file():
            return typed
        return direct

    # Patch bindings on the registry module (not env reload): the config barrel caches
    # MODELS_DIR from the first import, and VOCAL_MODEL_PATHS is built at import time.
    monkeypatch.setattr(registry_mod, "MODELS_DIR", tmp_path)
    monkeypatch.setattr(registry_mod, "MODELS_BY_TYPE_DIR", tmp_path / "models_by_type")
    monkeypatch.setattr(registry_mod, "MDXNET_MODELS_DIR", tmp_path / "mdxnet_models")
    monkeypatch.setattr(registry_mod, "resolve_models_root_file", resolve_in_tmp)
    monkeypatch.setattr(registry_mod, "VOCAL_MODEL_PATHS", [])

    resolved = registry_mod.get_available_vocal_onnx("fast")
    assert resolved is not None
    assert resolved.resolve() == ort_file.resolve()
