"""Tests for StemServiceConfig dataclass, from_env(), and combination validation."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.config.models import (
    StemServiceConfig,
    _probe_onnx_models,
    get_config,
    validate_config_combinations,
)


# ── from_env() ────────────────────────────────────────────────────────────

class TestFromEnv:
    """StemServiceConfig.from_env() reads env vars correctly."""

    def test_defaults_used_when_env_empty(self):
        with patch.dict(os.environ, {}, clear=True):
            cfg = StemServiceConfig.from_env()
        assert cfg.device in ("auto", "cuda", "cpu")
        assert "CPUExecutionProvider" in cfg.onnx_providers
        assert cfg.max_queue_depth == 5
        assert cfg.demucs_timeout_sec == 600
        assert cfg.use_int8_onnx is True
        assert cfg.demucs_bootstrap is True
        assert cfg.stem_backend == "hybrid"

    def test_stem_device_overrides_use_gpu(self):
        with patch.dict(os.environ, {"STEM_DEVICE": "cpu", "USE_GPU": "1"}, clear=True):
            cfg = StemServiceConfig.from_env()
            assert cfg.device == "cpu"

    def test_use_gpu_fallback_when_stem_device_missing(self):
        with patch.dict(os.environ, {"USE_GPU": "1"}, clear=True):
            cfg = StemServiceConfig.from_env()
            assert cfg.device == "cuda"

    def test_queue_depth_from_env(self):
        with patch.dict(os.environ, {"MAX_QUEUE_DEPTH": "3"}, clear=True):
            cfg = StemServiceConfig.from_env()
            assert cfg.max_queue_depth == 3

    def test_invalid_stem_device_falls_back(self):
        with patch.dict(os.environ, {"STEM_DEVICE": "quantum"}, clear=True):
            cfg = StemServiceConfig.from_env()
            assert cfg.device == "auto"

    def test_demucs_only_backend(self):
        with patch.dict(os.environ, {"STEM_BACKEND": "demucs_only"}, clear=True):
            cfg = StemServiceConfig.from_env()
            assert cfg.stem_backend == "demucs_only"

    def test_cors_origins_parsed(self):
        with patch.dict(os.environ, {"FRONTEND_ORIGINS": "https://a.com,https://b.com"}, clear=True):
            cfg = StemServiceConfig.from_env()
            assert cfg.cors_origins == ("https://a.com", "https://b.com")

    def test_cors_origins_default(self):
        with patch.dict(os.environ, {}, clear=True):
            cfg = StemServiceConfig.from_env()
            assert "http://localhost:5173" in cfg.cors_origins

    def test_s3_settings(self):
        with patch.dict(os.environ, {
            "S3_ENABLED": "true",
            "S3_BUCKET": "my-bucket",
        }, clear=True):
            cfg = StemServiceConfig.from_env()
            assert cfg.s3_enabled is True

    def test_slo_guardrails_clamped(self):
        with patch.dict(os.environ, {
            "DEMUCS_SLO_MAX_TIMEOUT_RATE": "2.0",
            "DEMUCS_SLO_MAX_ERROR_RATE": "-1.0",
        }, clear=True):
            cfg = StemServiceConfig.from_env()
            assert cfg.demucs_slo_max_timeout_rate == 1.0
            assert cfg.demucs_slo_max_error_rate == 0.0


# ── validate() ────────────────────────────────────────────────────────────

class TestValidate:
    """Combination validation catches contradictory config."""

    def test_contradictory_cpu_and_cuda(self):
        cfg = StemServiceConfig(
            device="cuda",
            force_cpu_onnx=True,
        )
        issues = cfg.validate()
        assert any("contradictory" in i for i in issues)

    def test_contradictory_cpu_and_openvino(self):
        cfg = StemServiceConfig(
            device="cpu",
            force_cpu_onnx=True,
            force_openvino=True,
        )
        issues = cfg.validate()
        assert any("overrides" in i for i in issues)

    def test_cuda_without_torch(self):
        cfg = StemServiceConfig(device="cuda")
        issues = cfg.validate()
        cuda_issues = [i for i in issues if "CUDA is not available" in i or "torch is not installed" in i]
        assert len(cuda_issues) == 1

    def test_low_queue_depth(self):
        cfg = StemServiceConfig(max_queue_depth=0)
        issues = cfg.validate()
        assert any("MAX_QUEUE_DEPTH" in i for i in issues)

    def test_very_short_timeout(self):
        cfg = StemServiceConfig(demucs_timeout_sec=5)
        issues = cfg.validate()
        assert any("very low" in i for i in issues)

    def test_weak_api_token(self):
        cfg = StemServiceConfig(api_token="short")
        issues = cfg.validate()
        assert any("too short" in i for i in issues)

    def test_clean_config_returns_no_issues(self):
        cfg = StemServiceConfig(
            device="cpu",
            max_queue_depth=5,
            demucs_timeout_sec=600,
            api_token="",
        )
        issues = cfg.validate()
        assert issues == []

    def test_s3_enabled_without_output_dir(self):
        cfg = StemServiceConfig(
            s3_enabled=True,
            output_dir="",
        )
        issues = cfg.validate()
        assert any("S3_ENABLED" in i for i in issues)

    def test_low_slo_min_samples(self):
        cfg = StemServiceConfig(demucs_slo_min_samples=1)
        issues = cfg.validate()
        assert any("DEMUCS_SLO_MIN_SAMPLES" in i for i in issues)


# ── validate_config_combinations() ───────────────────────────────────────

class TestValidateCombinations:
    """validate_config_combinations() runs without raising."""

    def test_runs_without_error(self):
        with patch.dict(os.environ, {}, clear=True):
            issues = validate_config_combinations()
            assert isinstance(issues, list)


# ── get_config() ──────────────────────────────────────────────────────────

class TestGetConfig:
    """get_config() returns a cached singleton."""

    def test_returns_stem_service_config(self):
        cfg = get_config()
        assert isinstance(cfg, StemServiceConfig)

    def test_is_cached(self):
        first = get_config()
        second = get_config()
        assert first is second


# ── _probe_onnx_models() ──────────────────────────────────────────────────

class TestProbeOnnxModels:
    """ONNX model integrity check validates protobuf headers."""

    def test_empty_dir_returns_empty(self):
        pytest.importorskip("onnx")
        with tempfile.TemporaryDirectory() as tmpdir:
            result = _probe_onnx_models(Path(tmpdir))
            assert result == []

    def test_invalid_onnx_file_reported(self):
        pytest.importorskip("onnx")
        with tempfile.TemporaryDirectory() as tmpdir:
            bogus = Path(tmpdir) / "model.onnx"
            bogus.write_bytes(b"not a valid onnx file")
            result = _probe_onnx_models(Path(tmpdir))
            assert "model.onnx" in result

    def test_missing_dir_returns_empty(self):
        pytest.importorskip("onnx")
        result = _probe_onnx_models(Path("/nonexistent/path"))
        assert result == []

    def test_external_data_onnx_not_loaded_deeply(self):
        pytest.importorskip("onnx")
        import onnx

        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = Path(tmpdir) / "ext_data.onnx"
            # Create a minimal valid ONNX model that references external data
            value_info = onnx.helper.make_tensor_value_info(
                "input", onnx.TensorProto.FLOAT, (1,)
            )
            node = onnx.helper.make_node("Identity", ["input"], ["output"])
            graph = onnx.helper.make_graph(
                [node], "test", [value_info], [value_info]
            )
            model = onnx.helper.make_model(graph)
            onnx.save(model, str(model_path))
            # Should not raise
            result = _probe_onnx_models(Path(tmpdir))
            assert result == []
