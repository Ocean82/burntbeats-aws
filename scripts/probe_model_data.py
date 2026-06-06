#!/usr/bin/env python3
"""
Cross-check MDX weights against UVR model_data.json and logical_onnx_registry.json.

For each logical name (or explicit path):
  1. Compute MD5 and look up UVR model_data.json when present.
  2. Fall back to logical_onnx_registry.json for ORT/ONNX artifacts.
  3. Flag compensate mismatch vs stem_service/mdx/model_registry._MDX_CONFIGS.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from stem_service.config import MODELS_DIR, resolve_models_root_file  # noqa: E402
from stem_service.mdx.model_registry import (  # noqa: E402
    _MDX_CONFIGS,
    _logical_onnx_name,
    mdx_config_for_logical_onnx_name,
    resolve_mdx_model_path,
)

UVR_DATA_PATHS = (
    REPO_ROOT / "models" / "mdxnet_models" / "model_data.json",
    REPO_ROOT / "models" / "MDX_Net_Models" / "model_data" / "model_data.json",
    MODELS_DIR / "model_data" / "model_data.json",
)

LOGICAL_REGISTRY_PATHS = (
    REPO_ROOT / "models" / "MDX_Net_Models" / "model_data" / "logical_onnx_registry.json",
    MODELS_DIR / "model_data" / "logical_onnx_registry.json",
)


def _load_json_maps() -> tuple[dict, dict[str, dict]]:
    uvr: dict = {}
    for p in UVR_DATA_PATHS:
        if p.is_file():
            try:
                uvr.update(json.loads(p.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                pass

    logical_by_md5: dict[str, dict] = {}
    logical_by_name: dict[str, dict] = {}
    for p in LOGICAL_REGISTRY_PATHS:
        if not p.is_file():
            continue
        try:
            payload = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for entry in payload.get("entries") or []:
            name = entry.get("logical_onnx")
            if name:
                logical_by_name[name] = entry
            md5 = entry.get("md5")
            if md5:
                logical_by_md5[md5] = entry
    return uvr, logical_by_md5, logical_by_name


def _md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _resolve_path(logical_or_path: str) -> tuple[str, Path | None]:
    p = Path(logical_or_path)
    if p.is_file():
        logical = _logical_onnx_name(p.name)
        return logical, p
    logical = logical_or_path if logical_or_path.endswith(".onnx") else f"{logical_or_path}.onnx"
    declared = resolve_models_root_file(logical)
    resolved = resolve_mdx_model_path(declared)
    if resolved is not None and resolved.is_file():
        return logical, resolved
    if declared.is_file():
        return logical, declared
    return logical, None


def probe_one(
    logical_or_path: str,
    uvr_data: dict,
    logical_by_md5: dict[str, dict],
    logical_by_name: dict[str, dict],
) -> None:
    logical, path = _resolve_path(logical_or_path)
    cfg = mdx_config_for_logical_onnx_name(logical)
    print(f"=== {logical} ===")
    if path is None:
        print("  FILE: missing")
        print()
        return
    print(f"  path: {path}")
    digest = _md5(path)
    print(f"  md5: {digest}")
    if cfg:
        print(f"  registry: n_fft={cfg[0]} hop={cfg[1]} dim_f={cfg[2]} dim_t={cfg[3]} compensate={cfg[4]}")
    uvr_entry = uvr_data.get(digest)
    if uvr_entry:
        print(f"  uvr_model_data: {uvr_entry}")
        uvr_comp = uvr_entry.get("compensate")
        if cfg and uvr_comp is not None and abs(float(uvr_comp) - cfg[4]) > 1e-6:
            print(
                f"  WARNING: compensate mismatch registry={cfg[4]} vs UVR model_data={uvr_comp}"
            )
    else:
        reg_entry = logical_by_name.get(logical) or logical_by_md5.get(digest)
        if reg_entry:
            print(
                f"  logical_registry: {reg_entry.get('logical_onnx')} "
                f"(generated {reg_entry.get('generated_at', 'n/a')})"
            )
        else:
            print(
                "  uvr_model_data: NOT FOUND "
                "(run scripts/build_mdx_logical_registry.py for ORT artifacts)"
            )
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe MDX model_data / logical registry")
    parser.add_argument(
        "models",
        nargs="*",
        help="Logical *.onnx names or paths (default: all _MDX_CONFIGS keys)",
    )
    parser.add_argument(
        "--export-only",
        action="store_true",
        help="Only probe production export logical names",
    )
    args = parser.parse_args()

    uvr_data, logical_by_md5, logical_by_name = _load_json_maps()

    if args.models:
        targets = args.models
    elif args.export_only:
        targets = [
            "UVR_MDXNET_3_9662.onnx",
            "UVR_MDXNET_KARA.onnx",
            "Kim_Vocal_2.onnx",
            "UVR-MDX-NET-Inst_HQ_5.onnx",
            "kuielab_b_vocals.onnx",
            "kuielab_b_drums.onnx",
            "kuielab_b_bass.onnx",
            "kuielab_b_other.onnx",
        ]
    else:
        targets = sorted(_MDX_CONFIGS.keys())

    for t in targets:
        probe_one(t, uvr_data, logical_by_md5, logical_by_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
