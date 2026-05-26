from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_cpu_budget_prefers_normalized_env_surface(monkeypatch) -> None:
    from stem_service.config.cpu_budget import cpu_budget_settings

    monkeypatch.setenv("STEM_CPU_WORKERS", "2")
    monkeypatch.setenv("STEM_CPU_THREADS", "6")
    monkeypatch.setenv("STEM_CPU_INTEROP_THREADS", "3")
    monkeypatch.setenv("SPLIT_MAX_CONCURRENCY", "9")
    monkeypatch.setenv("DEMUCS_CPU_THREADS", "10")

    settings = cpu_budget_settings()

    assert settings == {
        "queue_workers": 2,
        "job_threads": 6,
        "onnx_threads": 6,
        "torch_threads": 6,
        "torch_interop_threads": 3,
    }


def test_apply_cpu_budget_env_populates_legacy_runtime_vars(monkeypatch) -> None:
    from stem_service.config.cpu_budget import apply_cpu_budget_env

    monkeypatch.setenv("STEM_CPU_WORKERS", "1")
    monkeypatch.setenv("STEM_CPU_THREADS", "4")
    monkeypatch.setenv("STEM_CPU_INTEROP_THREADS", "2")

    settings = apply_cpu_budget_env()

    assert settings["job_threads"] == 4
    assert settings["queue_workers"] == 1
    assert settings["torch_interop_threads"] == 2
    assert os.environ["ONNXRUNTIME_NUM_THREADS"] == "4"
    assert os.environ["DEMUCS_CPU_THREADS"] == "4"
    assert os.environ["TORCH_CPU_THREADS"] == "4"
    assert os.environ["DEMUCS_INTEROP_THREADS"] == "2"
    assert os.environ["OMP_NUM_THREADS"] == "4"
    assert os.environ["MKL_NUM_THREADS"] == "4"
