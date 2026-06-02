"""Local socket RPC bridge for Demucs execution canary and fallback routing."""

from __future__ import annotations

import hashlib
import json
import logging
import multiprocessing
import socket
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from stem_service.config import (
    DEMUCS_POLICY_QUALITY_ONLY,
    DEMUCS_RPC_CANARY_PERCENT,
    DEMUCS_RPC_DISABLE_RSS_MB,
    DEMUCS_RPC_FALLBACK_ON_ERROR,
    DEMUCS_RPC_HEARTBEAT_TIMEOUT_SEC,
    DEMUCS_RPC_MAX_CONCURRENCY,
    DEMUCS_RPC_REQUEST_TIMEOUT_SEC,
    DEMUCS_RPC_SOCKET_HOST,
    DEMUCS_RPC_SOCKET_PORT,
    DEMUCS_RPC_WORKERS,
    DEMUCS_SLO_AUTO_ROLLBACK,
)

logger = logging.getLogger(__name__)

_server_process: multiprocessing.Process | None = None
_server_lock = threading.Lock()
_rpc_slots = threading.BoundedSemaphore(value=DEMUCS_RPC_MAX_CONCURRENCY)


@dataclass(frozen=True)
class DemucsRpcDecision:
    route: str
    fallback_on_error: bool


class DemucsRpcHeartbeatTimeout(TimeoutError):
    """Raised when the RPC worker stops sending heartbeats within the deadline."""


def _job_hash_bucket(job_id: str) -> int:
    digest = hashlib.sha256(job_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _rss_mb() -> int:
    if DEMUCS_RPC_DISABLE_RSS_MB <= 0:
        return 0
    try:
        import psutil

        proc = psutil.Process()
        return int(proc.memory_info().rss / (1024 * 1024))
    except Exception:
        return 0


def _slo_disables_rpc_canary() -> bool:
    if not DEMUCS_SLO_AUTO_ROLLBACK:
        return False
    try:
        from stem_service.job_utils import evaluate_demucs_slo, summarize_demucs_metrics

        slo = evaluate_demucs_slo(summarize_demucs_metrics())
        return bool(slo.get("disable_rpc_canary"))
    except Exception as exc:
        logger.debug("SLO evaluation skipped: %s", exc)
        return False


def choose_route(*, execution_mode: str, prefer_speed: bool, job_id: str) -> DemucsRpcDecision:
    if execution_mode == "legacy":
        return DemucsRpcDecision(route="legacy", fallback_on_error=False)
    if DEMUCS_POLICY_QUALITY_ONLY and prefer_speed:
        return DemucsRpcDecision(route="legacy", fallback_on_error=False)
    if DEMUCS_RPC_DISABLE_RSS_MB > 0 and _rss_mb() >= DEMUCS_RPC_DISABLE_RSS_MB:
        return DemucsRpcDecision(route="legacy", fallback_on_error=False)
    if _slo_disables_rpc_canary():
        logger.warning("Demucs RPC canary disabled by SLO auto-rollback")
        return DemucsRpcDecision(route="legacy", fallback_on_error=False)
    if execution_mode == "rpc":
        return DemucsRpcDecision(route="rpc", fallback_on_error=DEMUCS_RPC_FALLBACK_ON_ERROR)

    bucket = _job_hash_bucket(job_id)
    if bucket < DEMUCS_RPC_CANARY_PERCENT:
        return DemucsRpcDecision(route="rpc", fallback_on_error=DEMUCS_RPC_FALLBACK_ON_ERROR)
    return DemucsRpcDecision(route="legacy", fallback_on_error=False)


def ensure_rpc_server_started() -> None:
    global _server_process
    with _server_lock:
        if _server_process is not None and _server_process.is_alive():
            return
        _server_process = multiprocessing.Process(
            target=_run_server,
            name="demucs-rpc-server",
            daemon=True,
        )
        _server_process.start()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if _can_connect():
                logger.info(
                    "Demucs RPC server started on %s:%s workers=%s",
                    DEMUCS_RPC_SOCKET_HOST,
                    DEMUCS_RPC_SOCKET_PORT,
                    DEMUCS_RPC_WORKERS,
                )
                return
            time.sleep(0.1)
        logger.warning("Demucs RPC server start probe timed out")


def stop_rpc_server() -> None:
    global _server_process
    with _server_lock:
        if _server_process is None:
            return
        if _server_process.is_alive():
            _server_process.terminate()
            _server_process.join(timeout=2)
        _server_process = None


def _can_connect() -> bool:
    try:
        with socket.create_connection(
            (DEMUCS_RPC_SOCKET_HOST, DEMUCS_RPC_SOCKET_PORT),
            timeout=0.5,
        ):
            return True
    except OSError:
        return False


def _read_rpc_response(
    conn: socket.socket,
    *,
    heartbeat_timeout_sec: int | None = None,
) -> dict[str, Any]:
    """Read newline-delimited JSON until a terminal RPC response arrives."""
    timeout_sec = (
        heartbeat_timeout_sec
        if heartbeat_timeout_sec is not None
        else DEMUCS_RPC_HEARTBEAT_TIMEOUT_SEC
    )
    conn.settimeout(timeout_sec)
    buffer = ""
    while True:
        try:
            chunk = conn.recv(4096)
        except (socket.timeout, BlockingIOError) as exc:
            raise DemucsRpcHeartbeatTimeout(
                f"Demucs RPC heartbeat timeout ({timeout_sec}s without worker output)"
            ) from exc
        if not chunk:
            break
        buffer += chunk.decode("utf-8", errors="replace")
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            line = line.strip()
            if not line:
                continue
            message = json.loads(line)
            event = message.get("event")
            if event == "heartbeat":
                continue
            status = message.get("status")
            if status in ("completed", "failed"):
                return message
    if buffer.strip():
        message = json.loads(buffer.strip())
        if message.get("status") in ("completed", "failed"):
            return message
    raise RuntimeError("Empty or incomplete Demucs RPC response")


def run_demucs_via_rpc(request: dict[str, Any]) -> dict[str, Any]:
    ensure_rpc_server_started()
    acquired = _rpc_slots.acquire(timeout=DEMUCS_RPC_REQUEST_TIMEOUT_SEC)
    if not acquired:
        raise TimeoutError("Demucs RPC admission timeout")
    try:
        with socket.create_connection(
            (DEMUCS_RPC_SOCKET_HOST, DEMUCS_RPC_SOCKET_PORT),
            timeout=5,
        ) as conn:
            conn.sendall((json.dumps(request) + "\n").encode("utf-8"))
            return _read_rpc_response(conn)
    finally:
        _rpc_slots.release()


def _send_heartbeats(conn: socket.socket, stop_event: threading.Event) -> None:
    while not stop_event.wait(1.0):
        try:
            payload = json.dumps({"event": "heartbeat", "ts": time.time()}) + "\n"
            conn.sendall(payload.encode("utf-8"))
        except OSError:
            break


def _run_server() -> None:
    worker_sem = threading.BoundedSemaphore(value=DEMUCS_RPC_WORKERS)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((DEMUCS_RPC_SOCKET_HOST, DEMUCS_RPC_SOCKET_PORT))
        server.listen()
        while True:
            conn, _addr = server.accept()
            t = threading.Thread(
                target=_handle_client,
                args=(conn, worker_sem),
                daemon=True,
            )
            t.start()


def _handle_client(conn: socket.socket, worker_sem: threading.BoundedSemaphore) -> None:
    with conn:
        data = conn.recv(1024 * 1024)
        if not data:
            return
        try:
            payload = json.loads(data.decode("utf-8").strip())
        except json.JSONDecodeError as exc:
            conn.sendall(
                (json.dumps({"status": "failed", "error": str(exc)}) + "\n").encode("utf-8")
            )
            return

        with worker_sem:
            stop_heartbeats = threading.Event()
            heartbeat_thread = threading.Thread(
                target=_send_heartbeats,
                args=(conn, stop_heartbeats),
                daemon=True,
            )
            heartbeat_thread.start()
            try:
                response = _execute_request(payload)
            finally:
                stop_heartbeats.set()
                heartbeat_thread.join(timeout=1)
            conn.sendall((json.dumps(response) + "\n").encode("utf-8"))


def _execute_request(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from stem_service.split import run_demucs_legacy

        stems = run_demucs_legacy(
            input_path=Path(payload["input_path"]),
            output_dir=Path(payload["output_dir"]),
            stems=int(payload["stems"]),
            prefer_speed=bool(payload["prefer_speed"]),
            cancel_check=None,
            health_callback=None,
        )
        return {
            "status": "completed",
            "stems": [(stem_id, str(path)) for stem_id, path in stems],
            "route": "rpc",
        }
    except Exception as exc:
        return {
            "status": "failed",
            "error": str(exc),
            "route": "rpc",
        }
