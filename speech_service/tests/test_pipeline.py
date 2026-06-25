"""Tests for speech_service.pipeline (run_enhance_sync)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture(autouse=True)
def mock_lava_model():
    model = MagicMock()
    sr = 48000
    duration = 2.0
    audio_np = np.zeros((int(sr * duration),), dtype=np.float32)
    model.load_audio.return_value = (audio_np, sr)

    enhanced = MagicMock()
    enhanced.detach.return_value.cpu.return_value.numpy.return_value = audio_np
    model.enhance.return_value = enhanced

    with patch("speech_service.pipeline.get_lava_model", return_value=model):
        yield model


class TestRunEnhanceSync:
    def test_writes_completed_progress(self, tmp_path: Path) -> None:
        from speech_service.pipeline import run_enhance_sync

        job_id = "test-job-001"
        out_dir = tmp_path / job_id
        out_dir.mkdir(parents=True, exist_ok=True)
        input_path = out_dir / "input.wav"
        import soundfile as sf

        sf.write(str(input_path), np.zeros((48000,), dtype=np.float32), 48000, subtype="PCM_16")

        run_enhance_sync(job_id, input_path, out_dir, denoise=True, batch=False)

        progress = out_dir / "progress.json"
        assert progress.is_file()
        import json

        data = json.loads(progress.read_text(encoding="utf-8"))
        assert data["status"] == "completed"
        assert data["job_id"] == job_id
        assert data["progress"] == 100
        assert (out_dir / "enhanced.wav").is_file()

    def test_writes_processing_progress_stages(self, tmp_path: Path) -> None:
        from speech_service.pipeline import run_enhance_sync

        job_id = "test-job-002"
        out_dir = tmp_path / job_id
        out_dir.mkdir(parents=True, exist_ok=True)
        input_path = out_dir / "input.wav"
        import soundfile as sf

        sf.write(str(input_path), np.zeros((48000,), dtype=np.float32), 48000, subtype="PCM_16")

        run_enhance_sync(job_id, input_path, out_dir, denoise=True, batch=False)

        progress = out_dir / "progress.json"
        assert progress.is_file()
        import json

        data = json.loads(progress.read_text(encoding="utf-8"))
        assert data["status"] == "completed"
        assert data["progress"] == 100

    def test_passes_denoise_and_batch_flags(self, tmp_path: Path, mock_lava_model: MagicMock) -> None:
        from speech_service.pipeline import run_enhance_sync

        job_id = "test-job-003"
        out_dir = tmp_path / job_id
        out_dir.mkdir(parents=True, exist_ok=True)
        input_path = out_dir / "input.wav"
        import soundfile as sf

        sf.write(str(input_path), np.zeros((48000,), dtype=np.float32), 48000, subtype="PCM_16")

        run_enhance_sync(job_id, input_path, out_dir, denoise=False, batch=True)

        mock_lava_model.load_audio.assert_called_once()
        mock_lava_model.enhance.assert_called_once_with(
            mock_lava_model.load_audio.return_value[0],
            denoise=False,
            batch=True,
        )

    def test_handles_model_load_error(self, tmp_path: Path) -> None:
        from speech_service.pipeline import run_enhance_sync

        with patch("speech_service.pipeline.get_lava_model", side_effect=RuntimeError("Model failed")):
            job_id = "test-job-004"
            out_dir = tmp_path / job_id
            out_dir.mkdir(parents=True, exist_ok=True)
            input_path = out_dir / "input.wav"
            import soundfile as sf

            sf.write(str(input_path), np.zeros((48000,), dtype=np.float32), 48000, subtype="PCM_16")

            with pytest.raises(RuntimeError, match="Model failed"):
                run_enhance_sync(job_id, input_path, out_dir, denoise=True, batch=False)

    def test_invalid_input_path(self, tmp_path: Path) -> None:
        from speech_service.pipeline import run_enhance_sync

        with pytest.raises(Exception):
            run_enhance_sync(
                "test-job-005",
                tmp_path / "nonexistent.wav",
                tmp_path / "out",
                denoise=True,
                batch=False,
            )
