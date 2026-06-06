"""Kuielab B four-stem bag wiring in model_bag and mdx_4stem."""

from __future__ import annotations

import sys
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.routing import model_bag as mb  # noqa: E402


def _fake_path(name: str) -> Path:
    return Path(f"/models/{name}")


@pytest.fixture
def kuielab_on_disk(monkeypatch: pytest.MonkeyPatch) -> None:
    kuielab = {
        "kuielab_b_vocals.onnx",
        "kuielab_b_drums.onnx",
        "kuielab_b_bass.onnx",
        "kuielab_b_other.onnx",
    }

    def fake_resolve(logical: str) -> Path | None:
        if logical in kuielab:
            return _fake_path(logical)
        return None

    monkeypatch.setattr(mb, "_resolve_mdx_file", fake_resolve)
    monkeypatch.setattr(mb, "has_mdx_config", lambda _p: True)


def test_select_4stem_bag_prefers_kuielab_when_complete(
    kuielab_on_disk: None,
) -> None:
    assert mb.select_4stem_bag("high") == "kuielab_b"


def test_resolve_stem_model_uses_kuielab_other_only_with_bag(
    kuielab_on_disk: None,
) -> None:
    other = mb.resolve_stem_model("other", "high", bag="kuielab_b")
    assert other is not None
    assert other.name == "kuielab_b_other.onnx"

    assert mb.resolve_stem_model("other", "high", bag="uvr") is None


def test_resolve_stem_model_kuielab_vocals_only_with_explicit_bag(
    kuielab_on_disk: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        mb,
        "resolve_vocal_model",
        lambda _tier: _fake_path("UVR_MDXNET_KARA.onnx"),
    )
    monkeypatch.setattr(mb, "select_4stem_bag", lambda _tier: "uvr")
    assert mb.resolve_stem_model("vocals", "high", bag="kuielab_b").name == (
        "kuielab_b_vocals.onnx"
    )
    assert mb.resolve_stem_model("vocals", "high").name == "UVR_MDXNET_KARA.onnx"


def test_specialized_available_other_with_kuielab(
    kuielab_on_disk: None,
) -> None:
    assert mb.specialized_available("other", "high") is True


def test_mdx_4stem_runs_four_targets_with_kuielab_bag(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from stem_service.routing.pipelines import mdx_4stem

    monkeypatch.setattr(mdx_4stem, "select_4stem_bag", lambda _tier: "kuielab_b")

    calls: list[str] = []

    def fake_run(
        input_path: Path,
        output_dir: Path,
        target: str,
        **kwargs: object,
    ) -> tuple[list[tuple[str, Path]], list[str]]:
        calls.append(target)
        out = output_dir / "stems" / f"{target}.wav"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"x")
        return [(target, out)], [f"{target}.onnx"]

    monkeypatch.setattr(mdx_4stem, "run_mdx_target_stem", fake_run)
    monkeypatch.setattr(
        mdx_4stem,
        "create_residual_stem",
        lambda *_a, **_k: (_ for _ in ()).throw(
            AssertionError("residual other must not run for kuielab bag")
        ),
    )

    inp = tmp_path / "in.wav"
    inp.write_bytes(b"wav")
    out = tmp_path / "out"
    stems, models = mdx_4stem.run_mdx_4stem(inp, out, model_tier="quality")

    assert set(calls) == {"vocals", "drums", "bass", "other"}
    assert {s[0] for s in stems} == {"vocals", "drums", "bass", "other"}
    assert "residual_other" not in models


def test_kuielab_stft_shapes_when_on_disk() -> None:
    """Run _stft with registry params for each kuielab stem when weights exist."""
    import torch

    from stem_service.config import resolve_models_root_file
    from stem_service.mdx.model_registry import (
        KUIELAB_B_LOGICAL_ONNX,
        _get_config,
        resolve_mdx_model_path,
    )
    from stem_service.mdx.stft import _stft

    missing = []
    for logical in sorted(KUIELAB_B_LOGICAL_ONNX):
        declared = resolve_models_root_file(logical)
        path = resolve_mdx_model_path(declared) or (
            declared if declared.is_file() else None
        )
        if path is None:
            missing.append(logical)
            continue
        cfg = _get_config(path)
        assert cfg is not None, logical
        n_fft, hop, dim_f, dim_t, _comp = cfg
        trim = n_fft // 2
        chunk_samples = hop * (dim_t - 1)
        mix = torch.zeros(1, 2, chunk_samples + 2 * trim, dtype=torch.float32)
        spec = _stft(mix, n_fft=n_fft, hop=hop, dim_f=dim_f)
        assert spec.shape[1] == 4, f"{logical}: expected 4 STFT channels"
        assert spec.shape[2] == dim_f, f"{logical}: dim_f mismatch"
        assert spec.shape[3] >= dim_t, f"{logical}: STFT time frames shorter than dim_t"
    if len(missing) == len(KUIELAB_B_LOGICAL_ONNX):
        pytest.skip("no kuielab B ONNX/ORT files on disk")
