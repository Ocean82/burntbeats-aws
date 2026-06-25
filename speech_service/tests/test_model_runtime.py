"""Tests for speech_service.model_runtime (lazy loading, startup verification)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_lavasr():
    """Mock LavaSR package so tests don't need the real dependency installed."""
    mock_model = MagicMock()
    mock_model.resolve_model_root = lambda root_str: Path(root_str)

    mock_lavasr = MagicMock()
    mock_lavasr.model = mock_model

    with patch.dict("sys.modules", {"LavaSR": mock_lavasr, "LavaSR.model": mock_model}):
        yield


class TestVerifyModelsAtStartup:
    @pytest.fixture(autouse=True)
    def _patch_models_dir(self, tmp_path: Path):
        from speech_service import model_runtime as mr

        self._orig_mr = mr.SPEECH_MODELS_DIR
        yield
        mr.SPEECH_MODELS_DIR = self._orig_mr

    def test_raises_when_config_missing(self, tmp_path: Path) -> None:
        from speech_service.model_runtime import verify_models_at_startup, SPEECH_MODELS_DIR as mr_dir

        mr_dir = tmp_path / "nonexistent_models"
        import speech_service.model_runtime as mr
        mr.SPEECH_MODELS_DIR = mr_dir

        with pytest.raises(FileNotFoundError, match="config.yaml"):
            verify_models_at_startup()

    def test_raises_when_denoiser_missing(self, tmp_path: Path) -> None:
        from speech_service.model_runtime import verify_models_at_startup
        import speech_service.model_runtime as mr

        models_dir = tmp_path / "models"
        (models_dir / "enhancer_v2").mkdir(parents=True)
        (models_dir / "enhancer_v2" / "config.yaml").write_text("dummy", encoding="utf-8")

        mr.SPEECH_MODELS_DIR = models_dir
        with pytest.raises(FileNotFoundError, match="denoiser"):
            verify_models_at_startup()

    def test_raises_when_enhancer_weights_missing(self, tmp_path: Path) -> None:
        from speech_service.model_runtime import verify_models_at_startup
        import speech_service.model_runtime as mr

        models_dir = tmp_path / "models"
        (models_dir / "enhancer_v2").mkdir(parents=True)
        (models_dir / "enhancer_v2" / "config.yaml").write_text("dummy", encoding="utf-8")
        (models_dir / "denoiser").mkdir(parents=True)
        (models_dir / "denoiser" / "denoiser.bin").write_bytes(b"weights")

        mr.SPEECH_MODELS_DIR = models_dir
        with pytest.raises(FileNotFoundError, match="enhancer"):
            verify_models_at_startup()

    def test_passes_when_all_files_present(self, tmp_path: Path) -> None:
        from speech_service.model_runtime import verify_models_at_startup
        import speech_service.model_runtime as mr

        models_dir = tmp_path / "models"
        (models_dir / "enhancer_v2").mkdir(parents=True)
        (models_dir / "enhancer_v2" / "config.yaml").write_text("dummy", encoding="utf-8")
        (models_dir / "denoiser").mkdir(parents=True)
        (models_dir / "denoiser" / "denoiser.bin").write_bytes(b"weights")
        (models_dir / "enhancer_v2" / "pytorch_model.bin").write_bytes(b"weights")

        mr.SPEECH_MODELS_DIR = models_dir
        verify_models_at_startup()


class TestGetLavaModel:
    def test_lazy_load_returns_model(self) -> None:
        import speech_service.model_runtime as mr

        mr._model = None
        result = mr.get_lava_model()
        assert result is not None

    def test_returns_cached_instance(self) -> None:
        import speech_service.model_runtime as mr

        class _FakeModel:
            pass

        fake = _FakeModel()
        mr._model = fake
        try:
            result = mr.get_lava_model()
            assert result is fake
        finally:
            mr._model = None
