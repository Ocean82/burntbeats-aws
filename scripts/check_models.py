#!/usr/bin/env python3
"""Verify model configuration."""

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
    mdx23c_vocal_available,
    mdx23c_inst_available,
)
from stem_service.mdx_onnx import get_available_vocal_onnx, get_available_inst_onnx

print("=== Demucs Model Check ===")
print(f"MODELS_DIR: {MODELS_DIR}")
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
print("=== 2-Stem ONNX Check ===")
print(f"SPEED_2STEM_ONNX: {speed_2stem_onnx_path()}")
print(f"mdx23c_vocal_available(): {mdx23c_vocal_available()}")
print(f"mdx23c_inst_available(): {mdx23c_inst_available()}")

print()
print("Available ONNX models:")
v = get_available_vocal_onnx("quality")
i = get_available_inst_onnx("quality")
print(f"  vocal (quality): {v}")
print(f"  inst (quality): {i}")

v_fast = get_available_vocal_onnx("fast")
i_fast = get_available_inst_onnx("fast")
print(f"  vocal (fast): {v_fast}")
print(f"  inst (fast): {i_fast}")

print()
print("=== SCNet (4-stem optional) ===")
onnx_p = get_scnet_onnx_path()
print(f"get_scnet_onnx_path(): {onnx_p}")
print(f"scnet_available(): {scnet_available()}")
print(f"scnet_torch_available(): {scnet_torch_available()}")
if scnet_torch_available() or scnet_torch_repo_root():
    print(f"  SCNET_REPO resolved: {scnet_torch_repo_root()}")
    print(f"  checkpoint: {scnet_torch_checkpoint_path()} exists={scnet_torch_checkpoint_path().is_file()}")
    cfg = scnet_torch_config_path()
    print(f"  config: {cfg}")
