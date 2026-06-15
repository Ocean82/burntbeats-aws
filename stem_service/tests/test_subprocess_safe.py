"""Tests for safe subprocess argv helpers."""

from __future__ import annotations

import subprocess
import sys

import pytest

from stem_service.subprocess_safe import (
    assert_path_under_base,
    assert_trusted_onnx_path,
    popen_subprocess,
    run_subprocess,
    validate_model_name,
    validate_subprocess_argv,
)


def test_validate_model_name_rejects_shell_metacharacters() -> None:
    with pytest.raises(ValueError):
        validate_model_name("htdemucs;rm -rf /")


def test_validate_model_name_accepts_known_pattern() -> None:
    assert validate_model_name("htdemucs") == "htdemucs"


def test_run_subprocess_never_uses_shell() -> None:
    result = run_subprocess(
        [sys.executable, "-c", "print('ok')"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "ok" in result.stdout


def test_validate_subprocess_argv_rejects_nul_bytes() -> None:
    with pytest.raises(ValueError):
        validate_subprocess_argv(["python", "a\0b"])


def test_assert_path_under_base_rejects_escape(tmp_path) -> None:
    base = tmp_path / "base"
    base.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("x", encoding="utf-8")
    with pytest.raises(ValueError):
        assert_path_under_base(outside, base)


def test_assert_trusted_onnx_path_allows_external_models_dir(tmp_path) -> None:
    models_dir = tmp_path / "external-models"
    models_dir.mkdir()
    onnx_file = models_dir / "Kim_Vocal_2.onnx"
    onnx_file.write_bytes(b"ONNX")
    trusted = assert_trusted_onnx_path(onnx_file, models_dir)
    assert trusted == str(onnx_file.resolve())


def test_assert_trusted_onnx_path_rejects_escape(tmp_path) -> None:
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    outside = tmp_path / "evil.onnx"
    outside.write_bytes(b"ONNX")
    with pytest.raises(ValueError):
        assert_trusted_onnx_path(outside, models_dir)


def test_assert_trusted_onnx_path_rejects_non_onnx(tmp_path) -> None:
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    bad = models_dir / "model.bin"
    bad.write_bytes(b"x")
    with pytest.raises(ValueError):
        assert_trusted_onnx_path(bad, models_dir)


def test_popen_subprocess_uses_argv_mode() -> None:
    proc = popen_subprocess(
        [sys.executable, "-c", "import sys; sys.stdout.write('popen')"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    stdout, _ = proc.communicate(timeout=10)
    assert proc.returncode == 0
    assert "popen" in stdout
