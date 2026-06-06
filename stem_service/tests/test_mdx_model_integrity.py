"""Deployment integrity checks for MDX weight files on disk."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.config import resolve_models_root_file  # noqa: E402
from stem_service.mdx.model_registry import resolve_mdx_model_path  # noqa: E402


def _md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _resolve_logical(logical: str) -> Path | None:
    declared = resolve_models_root_file(logical)
    resolved = resolve_mdx_model_path(declared)
    if resolved is not None and resolved.is_file():
        return resolved
    if declared.is_file():
        return declared
    return None


def test_mdx23c_vocal_is_not_byte_identical_to_kim_vocal_2() -> None:
    """mdx23c_vocal must not be a mislabeled Kim_Vocal_2 copy."""
    mdx23c = _resolve_logical("mdx23c_vocal.onnx")
    kim = _resolve_logical("Kim_Vocal_2.onnx")
    if mdx23c is None or kim is None:
        pytest.skip("mdx23c_vocal or Kim_Vocal_2 not on disk")
    assert _md5(mdx23c) != _md5(kim), (
        "mdx23c_vocal is byte-identical to Kim_Vocal_2 — mislabeled duplicate; "
        "remove from models/ or replace with a real MDX23C export"
    )
