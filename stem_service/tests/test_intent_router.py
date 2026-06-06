from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from stem_service.routing.router import route_intent
from stem_service.routing.schema import SplitIntent, intent_from_legacy


def test_intent_from_legacy_2_stem() -> None:
    intent = intent_from_legacy(2, "speed")
    assert intent.task == "full_separation"
    assert intent.mode == "2"
    assert intent.quality == "fast"


def test_route_full_separation_4_uses_mdx_when_bag_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import stem_service.routing.router as router_mod

    monkeypatch.setattr(router_mod, "select_4stem_bag", lambda _tier: "uvr")
    intent = SplitIntent(task="full_separation", mode="4", quality="high")
    plan = route_intent(intent)
    assert plan.output_stems == ("vocals", "drums", "bass", "other")
    assert len(plan.jobs) == 1
    assert plan.jobs[0].kind == "mdx_4stem"
    assert "mdx_4stem_onnx" in plan.routing_notes
    assert not plan.uses_hybrid_4stem()


def test_route_full_separation_4_falls_back_to_hybrid_without_bag(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import stem_service.routing.router as router_mod

    monkeypatch.setattr(router_mod, "select_4stem_bag", lambda _tier: None)
    intent = SplitIntent(task="full_separation", mode="4", quality="high")
    plan = route_intent(intent)
    assert plan.jobs[0].kind == "hybrid_4"
    assert plan.uses_hybrid_4stem()
    assert "routing_fallback:hybrid_4_demucs" in plan.routing_notes


def test_route_extract_vocals_only() -> None:
    intent = SplitIntent(task="extract", targets=("vocals",), quality="fast")
    plan = route_intent(intent)
    assert plan.output_stems == ("vocals",)
    assert plan.jobs[0].kind == "vocals_only"
    assert not plan.uses_hybrid_4stem()


def test_route_remove_vocals_karaoke() -> None:
    intent = SplitIntent(task="remove", targets=("vocals",), quality="high")
    plan = route_intent(intent)
    assert plan.output_stems == ("instrumental",)
    assert plan.jobs[0].kind == "karaoke"
    assert not plan.uses_hybrid_4stem()


def test_route_extract_drums_uses_fallback_without_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import stem_service.routing.router as router_mod

    monkeypatch.setattr(router_mod, "specialized_available", lambda _t, _tier: False)
    intent = SplitIntent(task="extract", targets=("drums",), quality="fast")
    plan = route_intent(intent)
    assert plan.jobs[0].kind == "demucs_4_fallback"
    assert plan.uses_hybrid_4stem()
    assert "routing_fallback" in plan.routing_notes[0]


def test_route_extract_vocals_and_drums_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import stem_service.routing.router as router_mod

    monkeypatch.setattr(router_mod, "specialized_available", lambda _t, _tier: False)
    intent = SplitIntent(
        task="extract", targets=("vocals", "drums"), quality="high"
    )
    plan = route_intent(intent)
    assert plan.uses_hybrid_4stem()
    assert "vocals" in plan.jobs[0].targets or "drums" in plan.jobs[0].targets


def test_route_parallel_when_all_specialized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import stem_service.routing.router as router_mod

    def fake_spec(target: str, _tier: str) -> bool:
        return target in ("vocals", "drums")

    monkeypatch.setattr(router_mod, "specialized_available", fake_spec)
    intent = SplitIntent(
        task="extract", targets=("vocals", "drums"), quality="fast"
    )
    plan = route_intent(intent)
    assert plan.jobs[0].kind == "parallel_mdx"
    assert not plan.uses_hybrid_4stem()
