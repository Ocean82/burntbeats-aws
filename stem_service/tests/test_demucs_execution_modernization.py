from __future__ import annotations

import json
import socket
import sys
import threading
import time
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


def test_demucs_only_2stem_hybrid_rpc_failure_falls_back_e2e(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Hybrid canary hits RPC, RPC fails, pipeline completes via legacy fallback."""
    import stem_service.demucs_rpc as rpc
    import stem_service.split as split_mod
    from stem_service.hybrid.pipeline_2stem import run_demucs_only_2stem

    input_path = tmp_path / "input.wav"
    input_path.write_bytes(b"stub")
    output_dir = tmp_path / "job-out"
    output_dir.mkdir(parents=True)

    vocals_src = output_dir / "stage1_demucs" / "htdemucs" / "input" / "vocals.wav"
    inst_src = output_dir / "stage1_demucs" / "htdemucs" / "input" / "no_vocals.wav"
    vocals_src.parent.mkdir(parents=True, exist_ok=True)
    vocals_src.write_bytes(b"v")
    inst_src.write_bytes(b"i")

    monkeypatch.setattr(split_mod, "DEMUCS_EXECUTION_MODE", "hybrid")
    monkeypatch.setattr(rpc, "DEMUCS_RPC_CANARY_PERCENT", 100)
    monkeypatch.setattr(rpc, "_slo_disables_rpc_canary", lambda: False)
    monkeypatch.setattr(
        split_mod,
        "run_demucs_via_rpc",
        lambda _request: (_ for _ in ()).throw(RuntimeError("rpc unavailable")),
    )
    monkeypatch.setattr(
        split_mod,
        "run_demucs_legacy",
        lambda **_kwargs: [("vocals", vocals_src), ("instrumental", inst_src)],
    )

    stem_list, models_used = run_demucs_only_2stem(
        input_path,
        output_dir,
        prefer_speed=False,
        job_id="00000000-0000-0000-0000-000000000101",
    )

    assert split_mod.get_last_execution_route() == "rpc_fallback_legacy"
    assert [stem_id for stem_id, _path in stem_list] == ["vocals", "instrumental"]
    assert models_used == ["htdemucs"]
    assert (output_dir / "stems" / "vocals.wav").is_file()
    assert (output_dir / "stems" / "instrumental.wav").is_file()


def test_read_rpc_response_heartbeat_timeout() -> None:
    import stem_service.demucs_rpc as rpc

    host = "127.0.0.1"
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_sock.bind((host, 0))
    server_sock.listen(1)
    port = server_sock.getsockname()[1]

    def _serve_without_terminal_response() -> None:
        conn, _addr = server_sock.accept()
        with conn:
            # Hold connection open without sending a terminal RPC payload.
            time.sleep(1.0)

    thread = threading.Thread(target=_serve_without_terminal_response, daemon=True)
    thread.start()
    time.sleep(0.05)

    with socket.create_connection((host, port), timeout=2) as client:
        with pytest.raises(rpc.DemucsRpcHeartbeatTimeout):
            rpc._read_rpc_response(client, heartbeat_timeout_sec=0.1)

    server_sock.close()
    thread.join(timeout=2)


def test_evaluate_demucs_slo_breach_disables_canary(monkeypatch: pytest.MonkeyPatch) -> None:
    from stem_service import job_utils

    monkeypatch.setattr(job_utils, "DEMUCS_SLO_MIN_SAMPLES", 5)
    monkeypatch.setattr(job_utils, "DEMUCS_SLO_MAX_TIMEOUT_RATE", 0.1)
    monkeypatch.setattr(job_utils, "DEMUCS_SLO_MAX_ERROR_RATE", 0.2)
    monkeypatch.setattr(job_utils, "DEMUCS_SLO_AUTO_ROLLBACK", True)

    slo = job_utils.evaluate_demucs_slo(
        {
            "count": 10,
            "timeout_rate": 0.5,
            "error_rate": 0.0,
            "routes": {"rpc": 3, "legacy": 7},
        }
    )
    assert slo["status"] == "breach"
    assert slo["healthy"] is False
    assert slo["disable_rpc_canary"] is True
    assert "timeout_rate" in slo["breaches"]


def test_choose_route_slo_auto_rollback_forces_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    import stem_service.demucs_rpc as rpc

    monkeypatch.setattr(rpc, "DEMUCS_RPC_CANARY_PERCENT", 100)
    monkeypatch.setattr(rpc, "_slo_disables_rpc_canary", lambda: True)

    decision = rpc.choose_route(
        execution_mode="hybrid",
        prefer_speed=False,
        job_id="job-slo-rollback",
    )
    assert decision.route == "legacy"


def test_health_includes_demucs_slo_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from stem_service import server

    monkeypatch.setattr(
        server,
        "summarize_demucs_metrics",
        lambda max_rows=500: {
            "count": 25,
            "latency_p50_s": 12.0,
            "latency_p95_s": 40.0,
            "timeout_rate": 0.02,
            "error_rate": 0.04,
            "routes": {"legacy": 20, "rpc": 5},
        },
    )

    payload = asyncio.run(server.health())
    demucs = payload["demucs_execution"]
    assert demucs["slo"]["status"] == "ok"
    assert demucs["slo"]["healthy"] is True
    assert demucs["metrics"]["timeout_rate"] == 0.02
