#!/usr/bin/env python3
"""Print what the stem service can actually load from the current models root."""

import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from stem_service.config import (
    MODELS_DIR,
    HTDEMUCS_TH,
    HTDEMUCS_PTH,
    htdemucs_available,
    DEMUCS_QUALITY_BAG,
    DEMUCS_EXTRA_MODELS_DIR,
    demucs_extra_available,
    demucs_speed_4stem_available,
    demucs_speed_4stem_configs,
    demucs_quality_4stem_available,
    demucs_quality_4stem_configs,
    demucs_quality_yaml_bags_allowed,
    get_demucs_quality_bag_config,
    resolve_demucs_quality_bag,
    get_scnet_onnx_path,
    scnet_available,
    scnet_torch_available,
    scnet_torch_checkpoint_path,
    scnet_torch_config_path,
    scnet_torch_repo_root,
    speed_2stem_onnx_path,
    mdx23c_inst_available,
)
from stem_service.mdx_onnx import get_available_vocal_onnx, get_available_inst_onnx
from stem_service.config import resolve_models_root_file
from stem_service.mdx.model_registry import resolve_mdx_model_path
from stem_service.routing.model_bag import kuielab_b_ready, select_4stem_bag, intent_routing_health

_models_env = os.environ.get("STEM_MODELS_DIR", "models").strip() or "models"


def _file_md5(path: Path) -> str | None:
    if not path.is_file():
        return None
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _resolve_mdx(logical: str) -> Path | None:
    declared = resolve_models_root_file(logical)
    resolved = resolve_mdx_model_path(declared)
    if resolved is not None and resolved.is_file():
        return resolved
    if declared.is_file():
        return declared
    return None


print("=== Models root ===")
print(f"STEM_MODELS_DIR (env): {_models_env}")
print(f"MODELS_DIR (resolved): {MODELS_DIR}")
print()
print("Layout (why onnx/ vs ort/):")
print("  models_by_type/onnx/  — ONNX files (kuielab 4-stem, models without ORT conversion)")
print("  models_by_type/ort/   — ORT files (tier-1 vocal/inst when converted — preferred at runtime)")
print("  models_by_type/th/    — Demucs checkpoints")
print("  Logical names use *.onnx; runtime may load the matching *.ort instead.")
print()

manifest_path = MODELS_DIR / "MANIFEST.json"
if manifest_path.is_file():
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        print(f"=== Export manifest ({manifest_path.name}) ===")
        print(f"  generated_at: {manifest.get('generated_at')}")
        print(f"  source_tree: {manifest.get('source_tree')}")
        files = manifest.get("files") or []
        onnx_count = sum(1 for f in files if str(f.get("relative_path", "")).endswith(".onnx"))
        ort_count = sum(1 for f in files if str(f.get("relative_path", "")).endswith(".ort"))
        print(f"  exported: {len(files)} files ({ort_count} ort, {onnx_count} onnx)")
        print(f"  also see: {MODELS_DIR / 'LAYOUT.txt'}")
        print()
    except (OSError, json.JSONDecodeError):
        pass
elif _models_env == "server_models":
    print("=== Export manifest ===")
    print("  (no MANIFEST.json — run: python scripts/export_server_models.py)")
    print()

print("=== 2-stem MDX (what jobs will use) ===")
for tier in ("fast", "quality"):
    v = get_available_vocal_onnx(tier)
    i = get_available_inst_onnx(tier)
    print(f"  tier={tier:7}  vocal={v or 'MISSING'}")
    print(f"  tier={tier:7}  inst ={i or '(phase inversion if missing)'}")
print(f"  speed default path: {speed_2stem_onnx_path()}")
print(f"  mdx23c_inst: {mdx23c_inst_available()}")
print()

print("=== 4-stem routing ===")
print(f"  kuielab_b_ready: {kuielab_b_ready()}")
print(f"  active bag (quality): {select_4stem_bag('high')}")
print(f"  htdemucs_available: {htdemucs_available()}  ({HTDEMUCS_TH.name} exists={HTDEMUCS_TH.exists()})")
print(f"  demucs_speed_4stem: {demucs_speed_4stem_available()}")
print(f"  demucs_quality_4stem: {demucs_quality_4stem_available()}")
print(f"  scnet_onnx: {get_scnet_onnx_path()}  available={scnet_available()}")
print()

health = intent_routing_health("high")
print("=== Per-stem specialized models (quality tier) ===")
for target, row in health.get("targets", {}).items():
    ready = row.get("specialized_ready")
    model = row.get("resolved_model") or "-"
    backend = row.get("backend")
    print(f"  {target:14}  ready={ready!s:5}  backend={backend}  model={model}")
print()

print("=== Demucs Model Check ===")
print(f"HTDEMUCS_TH: {HTDEMUCS_TH} | exists: {HTDEMUCS_TH.exists()}")
print(f"HTDEMUCS_PTH: {HTDEMUCS_PTH} | exists: {HTDEMUCS_PTH.exists()}")
print(f"htdemucs_available(): {htdemucs_available()}")

print()
print("=== 4-stem Demucs quality (single checkpoints) ===")
print(f"DEMUCS_QUALITY_BAG: {DEMUCS_QUALITY_BAG}")
print(f"demucs_quality_yaml_bags_allowed(): {demucs_quality_yaml_bags_allowed()}")
print(f"demucs_quality_4stem_available(): {demucs_quality_4stem_available()}")
for row in demucs_quality_4stem_configs():
    name, repo, seg, sub, ck = row
    print(
        f"  quality 4-stem: -n {name}  --repo {repo}  --segment {seg}  out={sub}/  ck={ck.name}"
    )

_cfgs = demucs_quality_4stem_configs()
if len(_cfgs) >= 2:
    _ck1, _ck2 = _cfgs[0][4], _cfgs[1][4]
    if _ck1.is_file() and _ck2.is_file() and _ck1.stat().st_size == _ck2.stat().st_size:
        def _sha256(p: Path) -> bytes:
            h = hashlib.sha256()
            with open(p, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    h.update(chunk)
            return h.digest()

        if _sha256(_ck1) == _sha256(_ck2):
            print(
                "  WARNING: quality rank1 and rank2 checkpoint files are byte-identical - "
                "rank1 should be 04573f0d-f3cf25b2__29d4388e, not the same blob as rank2 "
                "(see scripts/sync_models_from_model_testing.ps1; add __29d4388e.th to __model_testing)."
            )

print()
print("=== Quality YAML bags (only if DEMUCS_QUALITY_BAG is auto/bags) ===")
print(f"DEMUCS_EXTRA_MODELS_DIR: {DEMUCS_EXTRA_MODELS_DIR}")
print(f"demucs_extra_available(): {demucs_extra_available()}")
resolved = resolve_demucs_quality_bag()
if resolved:
    name, yp = resolved
    mname, repo, seg, sub = get_demucs_quality_bag_config()
    print(f"resolved bag: {name}  yaml={yp.name}  -n {mname}  --segment {seg}  out={sub}/")
else:
    print("resolved bag: (none — with single mode, 4-stem quality uses rank folders or htdemucs)")

print(f"demucs_speed_4stem_available(): {demucs_speed_4stem_available()}")
for row in demucs_speed_4stem_configs():
    name, repo, seg, sub, ck = row
    print(
        f"  speed 4-stem: -n {name}  --repo {repo}  --segment {seg}  out={sub}/  ck={ck.name}"
    )

print()
print("=== SCNet torch (optional) ===")
print(f"scnet_torch_available(): {scnet_torch_available()}")
if scnet_torch_available() or scnet_torch_repo_root():
    print(f"  SCNET_REPO resolved: {scnet_torch_repo_root()}")
    print(f"  checkpoint: {scnet_torch_checkpoint_path()} exists={scnet_torch_checkpoint_path().is_file()}")
    cfg = scnet_torch_config_path()
    print(f"  config: {cfg}")
