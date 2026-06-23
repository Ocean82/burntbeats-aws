"""Structured stem service configuration with env-driven instantiation and validation."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

_log = logging.getLogger(__name__)

DeviceKind = Literal["auto", "cuda", "cpu"]


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        _log.warning("Config: %s=%r is not a valid integer, using default %d", name, raw, default)
        return default


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        _log.warning("Config: %s=%r is not a valid float, using default %s", name, raw, default)
        return default


def _list_env(name: str, default: list[str] | None = None) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default or []
    return [x.strip() for x in raw.split(",") if x.strip()]


@dataclass(frozen=True)
class StemServiceConfig:
    """Single source of truth for stem service configuration.

    Instantiate via ``StemServiceConfig.from_env()``. All fields are derived
    from environment variables at call time. The frozen dataclass guarantees
    immutability after construction — call ``from_env()`` again to refresh.
    """

    # ── Device & providers ──────────────────────────────────────────────
    device: DeviceKind = "auto"
    onnx_providers: tuple[str, ...] = ("CPUExecutionProvider",)
    force_cpu_onnx: bool = False
    force_openvino: bool = False

    # ── ONNX model selection ────────────────────────────────────────────
    use_int8_onnx: bool = True
    disallow_ort: bool = False

    # ── Feature flags ───────────────────────────────────────────────────
    use_scnet: bool = True
    two_stem_inst_onnx_pass: bool = False
    demucs_bootstrap: bool = True
    demucs_shifts_0: bool = False
    stem_backend: str = "hybrid"
    four_stem_bag: str = "auto"

    # ── Paths ───────────────────────────────────────────────────────────
    models_dir: str = "models"
    output_dir: str = ""

    # ── Concurrency & timeouts ──────────────────────────────────────────
    max_queue_depth: int = 5
    demucs_timeout_sec: int = 600
    demucs_timeout_activity_sec: int = 180
    demucs_timeout_startup_grace_sec: int = 60
    demucs_slo_min_samples: int = 20
    demucs_slo_max_timeout_rate: float = 0.05
    demucs_slo_max_error_rate: float = 0.10
    cpu_threads: int = 0  # 0 = auto-detect
    cpu_workers: int = 1
    cpu_interop_threads: int = 1
    intent_max_parallel: int = 0  # 0 = auto (cpu_count // 2)

    # ── Auth & CORS ─────────────────────────────────────────────────────
    api_token: str = ""
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://localhost:3000")
    allow_missing_htdemucs: bool = False

    # ── S3 upload ───────────────────────────────────────────────────────
    s3_enabled: bool = False
    s3_upload_max_workers: int = 3
    s3_upload_timeout_sec: int = 120

    # ── Sentry ──────────────────────────────────────────────────────────
    sentry_environment: str = "production"

    # ── Internal ────────────────────────────────────────────────────────
    _node_env: str = "development"

    # ── Factory ─────────────────────────────────────────────────────────

    @classmethod
    def from_env(cls) -> StemServiceConfig:
        device_raw = os.environ.get("STEM_DEVICE", os.environ.get("USE_GPU", "auto")).strip().lower()
        if device_raw in ("1", "true", "yes"):
            device: DeviceKind = "cuda"
        elif device_raw in ("0", "false", "no"):
            device = "cpu"
        elif device_raw in ("auto", "cuda", "cpu"):
            device = device_raw  # type: ignore[assignment]
        else:
            _log.warning("Config: STEM_DEVICE=%r is invalid, falling back to 'auto'", device_raw)
            device = "auto"

        force_cpu_onnx = _bool_env("USE_ONNX_CPU", False)
        force_openvino = _bool_env("USE_ONNX_OPENVINO", False)

        providers = cls._resolve_onnx_providers(device, force_cpu_onnx, force_openvino)

        return cls(
            device=device,
            onnx_providers=providers,
            force_cpu_onnx=force_cpu_onnx,
            force_openvino=force_openvino,
            use_int8_onnx=_bool_env("USE_INT8_ONNX", True),
            disallow_ort=_bool_env("BURNTBEATS_DISALLOW_ORT", False),
            use_scnet=_bool_env("USE_SCNET", True),
            two_stem_inst_onnx_pass=_bool_env("USE_TWO_STEM_INST_ONNX_PASS", False),
            demucs_bootstrap=_bool_env("USE_DEMUCS_BOOTSTRAP", True),
            demucs_shifts_0=_bool_env("USE_DEMUCS_SHIFTS_0", False),
            stem_backend=cls._resolve_stem_backend(),
            four_stem_bag=os.environ.get("STEM_4STEM_BAG", "auto").strip().lower(),
            models_dir=os.environ.get("STEM_MODELS_DIR", "models").strip(),
            output_dir=os.environ.get("STEM_OUTPUT_DIR", "").strip(),
            max_queue_depth=_int_env("MAX_QUEUE_DEPTH", 5),
            demucs_timeout_sec=_int_env("DEMUCS_TIMEOUT_SEC", 600),
            demucs_timeout_activity_sec=_int_env("DEMUCS_TIMEOUT_ACTIVITY_SEC", 180),
            demucs_timeout_startup_grace_sec=_int_env("DEMUCS_TIMEOUT_STARTUP_GRACE_SEC", 60),
            demucs_slo_min_samples=max(1, _int_env("DEMUCS_SLO_MIN_SAMPLES", 20)),
            demucs_slo_max_timeout_rate=min(1.0, max(0.0, _float_env("DEMUCS_SLO_MAX_TIMEOUT_RATE", 0.05))),
            demucs_slo_max_error_rate=min(1.0, max(0.0, _float_env("DEMUCS_SLO_MAX_ERROR_RATE", 0.10))),
            cpu_threads=_int_env("STEM_CPU_THREADS", 0),
            cpu_workers=_int_env("STEM_CPU_WORKERS", 1),
            cpu_interop_threads=_int_env("STEM_CPU_INTEROP_THREADS", 1),
            intent_max_parallel=_int_env("STEM_INTENT_MAX_PARALLEL", 0),
            api_token=os.environ.get("STEM_SERVICE_API_TOKEN", ""),
            cors_origins=tuple(_list_env("FRONTEND_ORIGINS", ["http://localhost:5173", "http://localhost:3000"])),
            allow_missing_htdemucs=_bool_env("STEM_ALLOW_MISSING_HTDEMUCS", False),
            s3_enabled=os.environ.get("S3_ENABLED", "").lower() == "true",
            s3_upload_max_workers=max(1, _int_env("STEM_S3_UPLOAD_MAX_WORKERS", 3)),
            s3_upload_timeout_sec=max(5, _int_env("STEM_S3_UPLOAD_TIMEOUT_SEC", 120)),
            sentry_environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
            _node_env=os.environ.get("NODE_ENV", "development").lower(),
        )

    # ── Provider resolution ─────────────────────────────────────────────

    @staticmethod
    def _resolve_onnx_providers(
        device: DeviceKind,
        force_cpu_onnx: bool,
        force_openvino: bool,
    ) -> tuple[str, ...]:
        if force_cpu_onnx:
            return ("CPUExecutionProvider",)
        try:
            import onnxruntime as ort

            available = set(ort.get_available_providers())
        except ImportError:
            return ("CPUExecutionProvider",)

        order: list[str] = []
        if device in ("auto", "cuda"):
            order.append("CUDAExecutionProvider")
        if force_openvino:
            order.append("OpenVINOExecutionProvider")
        order.append("CPUExecutionProvider")

        return tuple(p for p in order if p in available) or ("CPUExecutionProvider",)

    @staticmethod
    def _resolve_stem_backend() -> str:
        raw = os.environ.get("STEM_BACKEND", "hybrid").strip().lower()
        if raw == "demucs_only":
            return "demucs_only"
        return "hybrid"

    # ── Validation ──────────────────────────────────────────────────────

    def validate(self) -> list[str]:
        """Return a list of configuration warnings/errors. Empty list = all checks pass."""
        issues: list[str] = []

        if self.force_cpu_onnx and self.device == "cuda":
            issues.append(
                "USE_ONNX_CPU=1 and STEM_DEVICE=cuda are contradictory — "
                "CPUExecutionProvider will be used exclusively"
            )
        if self.force_cpu_onnx and self.force_openvino:
            issues.append(
                "USE_ONNX_CPU=1 overrides USE_ONNX_OPENVINO=1 — "
                "OpenVINOExecutionProvider will not be used"
            )
        if self.device == "cuda":
            try:
                import torch

                if not torch.cuda.is_available():
                    issues.append(
                        "STEM_DEVICE=cuda but CUDA is not available — "
                        "will fall back to CPUExecutionProvider"
                    )
            except ImportError:
                issues.append(
                    "STEM_DEVICE=cuda but torch is not installed — "
                    "will fall back to CPUExecutionProvider"
                )
        if self.max_queue_depth < 1:
            issues.append(f"MAX_QUEUE_DEPTH={self.max_queue_depth} is invalid — must be >= 1")
        if self.demucs_timeout_sec < 30:
            issues.append(
                f"DEMUCS_TIMEOUT_SEC={self.demucs_timeout_sec} is very low — "
                f"separation jobs may timeout prematurely"
            )
        if self.api_token and len(self.api_token) < 8:
            issues.append(
                "STEM_SERVICE_API_TOKEN is set but too short (< 8 chars) — "
                "use a strong random token"
            )
        if self.s3_enabled and not self.output_dir:
            issues.append(
                "S3 upload enabled (S3_ENABLED=true) but STEM_OUTPUT_DIR is empty — "
                "local output may interfere with upload paths"
            )
        if self.demucs_slo_min_samples < 5:
            issues.append(
                f"DEMUCS_SLO_MIN_SAMPLES={self.demucs_slo_min_samples} is very low — "
                "SLO evaluation may be unreliable"
            )

        return issues

    def validate_and_raise(self) -> None:
        issues = self.validate()
        if issues:
            msg = "; ".join(issues)
            _log.warning("StemServiceConfig validation found %d issue(s): %s", len(issues), msg)
            raise ValueError(f"StemServiceConfig validation failed: {msg}")

    # ── Summary ─────────────────────────────────────────────────────────

    def summary(self) -> dict[str, object]:
        return {
            "device": self.device,
            "onnx_providers": list(self.onnx_providers),
            "force_cpu_onnx": self.force_cpu_onnx,
            "force_openvino": self.force_openvino,
            "use_int8_onnx": self.use_int8_onnx,
            "disallow_ort": self.disallow_ort,
            "use_scnet": self.use_scnet,
            "two_stem_inst_onnx_pass": self.two_stem_inst_onnx_pass,
            "demucs_bootstrap": self.demucs_bootstrap,
            "demucs_shifts_0": self.demucs_shifts_0,
            "stem_backend": self.stem_backend,
            "four_stem_bag": self.four_stem_bag,
            "max_queue_depth": self.max_queue_depth,
            "demucs_timeout_sec": self.demucs_timeout_sec,
            "allow_missing_htdemucs": self.allow_missing_htdemucs,
            "s3_enabled": self.s3_enabled,
            "cpu_threads": self.cpu_threads or os.cpu_count(),
        }


_CONFIG_CACHE: StemServiceConfig | None = None


def get_config() -> StemServiceConfig:
    """Return a cached ``StemServiceConfig`` singleton (reads env on first call)."""
    global _CONFIG_CACHE
    if _CONFIG_CACHE is None:
        _CONFIG_CACHE = StemServiceConfig.from_env()
    return _CONFIG_CACHE


def validate_config_combinations() -> list[str]:
    """Validate config combination rules. Logs warnings and returns any issues found."""
    cfg = get_config()
    issues = cfg.validate()
    if issues:
        _log.warning(
            "Config combination validation found %d issue(s):\n  %s",
            len(issues),
            "\n  ".join(issues),
        )
    else:
        _log.info("Config combination validation: all checks passed")
    return issues


def _probe_onnx_models(models_dir: Path) -> list[str]:
    """Try loading each .onnx file under ``models_dir`` / ``models_dir/models_by_type/onnx/``.

    Returns names of models that failed to load (empty list = all OK).
    Lightweight check: only validates the ONNX protobuf header, does NOT run full inference.

    Skips when ``onnx`` package is not installed (returns empty list).
    """
    try:
        import onnx  # noqa: F401
    except ImportError:
        _log.info("ONNX model integrity check skipped: 'onnx' package not installed")
        return []

    failed: list[str] = []
    onnx_dirs = [
        models_dir,
        models_dir / "models_by_type" / "onnx",
    ]
    seen: set[Path] = set()
    for d in onnx_dirs:
        if not d.is_dir():
            continue
        for fpath in sorted(d.glob("*.onnx")):
            if fpath in seen:
                continue
            seen.add(fpath)
            try:
                onnx.load(fpath, format="protobuf", load_external_data=False)
            except Exception as exc:
                _log.warning("ONNX model integrity check FAILED for %s: %s", fpath.name, exc)
                failed.append(fpath.name)
    return failed
