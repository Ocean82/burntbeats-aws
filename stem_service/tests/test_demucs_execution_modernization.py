from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def test_choose_route_hybrid_is_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    import stem_service.demucs_rpc as rpc

    monkeypatch.setattr(rpc, "DEMUCS_RPC_CANARY_PERCENT", 100)
    monkeypatch.setattr(rpc, "DEMUCS_POLICY_QUALITY_ONLY", False)
    monkeypatch.setattr(rpc, "DEMUCS_RPC_DISABLE_RSS_MB", 0)

    a = rpc.choose_route(execution_mode="hybrid", prefer_speed=False, job_id="job-1")
    b = rpc.choose_route(execution_mode="hybrid", prefer_speed=False, job_id="job-1")
    assert a.route == "rpc"
    assert b.route == "rpc"
    assert a == b


def test_choose_route_policy_quality_only_disables_speed(monkeypatch: pytest.MonkeyPatch) -> None:
    import stem_service.demucs_rpc as rpc

    monkeypatch.setattr(rpc, "DEMUCS_POLICY_QUALITY_ONLY", True)
    decision = rpc.choose_route(
        execution_mode="rpc",
        prefer_speed=True,
        job_id="job-speed",
    )
    assert decision.route == "legacy"


def test_run_demucs_rpc_fallback_calls_legacy(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import stem_service.split as split_mod

    input_path = tmp_path / "input.wav"
    input_path.write_bytes(b"stub")
    output_dir = tmp_path / "out"
    output_dir.mkdir(parents=True)

    monkeypatch.setattr(split_mod, "DEMUCS_EXECUTION_MODE", "rpc")
    monkeypatch.setattr(
        split_mod,
        "choose_route",
        lambda **_kwargs: type("Decision", (), {"route": "rpc", "fallback_on_error": True})(),
    )
    monkeypatch.setattr(
        split_mod,
        "run_demucs_via_rpc",
        lambda _request: (_ for _ in ()).throw(RuntimeError("rpc down")),
    )
    expected = [("vocals", output_dir / "vocals.wav")]
    monkeypatch.setattr(split_mod, "run_demucs_legacy", lambda **_kwargs: expected)

    actual = split_mod.run_demucs(input_path=input_path, output_dir=output_dir, stems=2)
    assert actual == expected
    assert split_mod.get_last_execution_route() == "rpc_fallback_legacy"


def test_run_demucs_rpc_success_sets_route(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import stem_service.split as split_mod

    input_path = tmp_path / "input.wav"
    input_path.write_bytes(b"stub")
    output_dir = tmp_path / "out"
    output_dir.mkdir(parents=True)
    vocals = output_dir / "vocals.wav"
    vocals.write_bytes(b"v")

    monkeypatch.setattr(split_mod, "DEMUCS_EXECUTION_MODE", "rpc")
    monkeypatch.setattr(
        split_mod,
        "choose_route",
        lambda **_kwargs: type("Decision", (), {"route": "rpc", "fallback_on_error": True})(),
    )
    monkeypatch.setattr(
        split_mod,
        "run_demucs_via_rpc",
        lambda _request: {"status": "completed", "stems": [("vocals", str(vocals))]},
    )
    actual = split_mod.run_demucs(input_path=input_path, output_dir=output_dir, stems=2)
    assert actual == [("vocals", vocals)]
    assert split_mod.get_last_execution_route() == "rpc"


def test_supervised_subprocess_cancellation() -> None:
    from stem_service.demucs_process import (
        DemucsProcessCancelledError,
        run_supervised_subprocess,
    )

    should_cancel = {"value": False}

    def cancel_check() -> bool:
        return should_cancel["value"]

    cmd = [
        sys.executable,
        "-c",
        "import time; print('start', flush=True); time.sleep(5)",
    ]

    # Trip cancellation quickly.
    should_cancel["value"] = True
    with pytest.raises(DemucsProcessCancelledError):
        run_supervised_subprocess(
            cmd=cmd,
            cwd=REPO_ROOT,
            hard_timeout_seconds=10,
            activity_timeout_seconds=10,
            startup_grace_seconds=0,
            cancel_check=cancel_check,
        )
