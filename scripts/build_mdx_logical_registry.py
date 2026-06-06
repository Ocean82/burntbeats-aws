#!/usr/bin/env python3
"""
Build repo-owned logical ONNX registry with MD5, size, probed shapes, and config tuple.

Writes:
  models/MDX_Net_Models/model_data/logical_onnx_registry.json

Also suitable for copying into server_models/model_data/ during export.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from stem_service.config import resolve_models_root_file  # noqa: E402
from stem_service.mdx.model_registry import (  # noqa: E402
    _MDX_CONFIGS,
    mdx_config_for_logical_onnx_name,
    resolve_mdx_model_path,
)

# Production export logical names (see scripts/export_server_models.py).
_EXPORT_LOGICAL_ONNX: tuple[str, ...] = (
    "UVR_MDXNET_3_9662.onnx",
    "UVR_MDXNET_KARA.onnx",
    "Kim_Vocal_2.onnx",
    "UVR-MDX-NET-Inst_HQ_5.onnx",
    "kuielab_b_vocals.onnx",
    "kuielab_b_drums.onnx",
    "kuielab_b_bass.onnx",
    "kuielab_b_other.onnx",
)

DEFAULT_OUT = (
    REPO_ROOT / "models" / "MDX_Net_Models" / "model_data" / "logical_onnx_registry.json"
)


def _md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _probe_dim_f_t(path: Path) -> tuple[int | None, int | None]:
    try:
        import onnxruntime as ort
    except ImportError:
        return None, None
    try:
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        shape = list(sess.get_inputs()[0].shape)
        if len(shape) >= 4:
            dim_f = shape[2]
            dim_t = shape[3]
            if isinstance(dim_f, int) and isinstance(dim_t, int):
                return dim_f, dim_t
    except Exception:
        pass
    return None, None


def _resolve_runtime(logical: str) -> Path | None:
    declared = resolve_models_root_file(logical)
    resolved = resolve_mdx_model_path(declared)
    if resolved is not None and resolved.is_file():
        return resolved
    if declared.is_file():
        return declared
    return None


def _logical_names() -> list[str]:
    names = set(_MDX_CONFIGS.keys()) | set(_EXPORT_LOGICAL_ONNX)
    return sorted(names)


def build_registry() -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    for logical in _logical_names():
        runtime = _resolve_runtime(logical)
        cfg = mdx_config_for_logical_onnx_name(logical)
        row: dict[str, Any] = {
            "logical_onnx": logical,
            "registry": list(cfg) if cfg else None,
            "runtime_path": str(runtime.resolve()) if runtime else None,
            "md5": None,
            "size_bytes": None,
            "probed_dim_f": None,
            "probed_dim_t": None,
        }
        if runtime is not None:
            row["md5"] = _md5(runtime)
            row["size_bytes"] = runtime.stat().st_size
            dim_f, dim_t = _probe_dim_f_t(runtime)
            row["probed_dim_f"] = dim_f
            row["probed_dim_t"] = dim_t
            if cfg is not None and dim_f is not None and dim_t is not None:
                _n, _h, reg_f, reg_t, _c = cfg
                if reg_f != dim_f or reg_t != dim_t:
                    row["shape_mismatch"] = {
                        "registry_dim_f": reg_f,
                        "registry_dim_t": reg_t,
                        "probed_dim_f": dim_f,
                        "probed_dim_t": dim_t,
                    }
        entries.append(row)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "models_root_env": __import__("os").environ.get("STEM_MODELS_DIR", "models"),
        "entries": entries,
    }


def main() -> int:
    out = DEFAULT_OUT
    if len(sys.argv) > 1:
        out = Path(sys.argv[1])
    payload = build_registry()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    on_disk = sum(1 for e in payload["entries"] if e.get("md5"))
    print(f"Wrote {on_disk}/{len(payload['entries'])} resolved entries to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
