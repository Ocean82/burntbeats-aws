#!/usr/bin/env python3
"""
Exports explicitly required production models into a `server_models/` folder.
This avoids burdening the final deployed payload with hundreds of gigabytes of testing subsets.
"""

import os
import shutil
import sys
from pathlib import Path

# Add project root to sys.path so we can import stem_service
_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_root))

from stem_service import config

def main():
    target_dir = _root / "server_models"
    print(f"Exporting server models to: {target_dir}")
    
    if target_dir.exists():
        print("Wiping existing server_models directory...")
        shutil.rmtree(target_dir, ignore_errors=True)
        
    target_dir.mkdir(parents=True, exist_ok=True)
    
    files_to_copy = []
    
    # 1. 2-Stem ONNX (MDX)
    files_to_copy.append(config.resolve_models_root_file("UVR_MDXNET_3_9662.onnx"))
    files_to_copy.append(config.resolve_models_root_file("UVR_MDXNET_KARA.onnx"))
    files_to_copy.append(config.resolve_models_root_file("mdx23c_vocal.onnx"))
    files_to_copy.append(config.resolve_models_root_file("Kim_Vocal_2.onnx"))
    
    # 2. VAD Filter
    files_to_copy.append(config.SILERO_VAD_ONNX)
    
    # 3. Fallback HTDemucs
    if config.HTDEMUCS_TH.exists():
        files_to_copy.append(config.HTDEMUCS_TH)
    elif config.HTDEMUCS_PTH.exists():
        files_to_copy.append(config.HTDEMUCS_PTH)
        
    # 4. 4-Stem Demucs Config
    for cfg in config.demucs_speed_4stem_configs():
        # returns (demucs_n, repo_path, segment, short_id, checkpoint_path)
        files_to_copy.append(cfg[4])
        
    # 5. 4-Stem Quality
    for cfg in config.demucs_quality_4stem_configs():
        files_to_copy.append(cfg[4])
        
    # Iterate and duplicate keeping structure intact
    copied = 0
    for file_path in files_to_copy:
        if not file_path or not file_path.exists():
            print(f"WARNING: Required file not found: {file_path}")
            continue
            
        # compute relative path spanning from the active models dir
        try:
            rel_path = file_path.relative_to(config.MODELS_DIR)
        except ValueError:
            print(f"WARNING: File {file_path} is not under {config.MODELS_DIR}. Dropping directly in root of server_models.")
            rel_path = Path(file_path.name)
            
        dest_path = target_dir / rel_path
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"Copying {rel_path}...")
        shutil.copy2(file_path, dest_path)
        copied += 1
        
    # Print the export footprint metric
    total_mb = sum(f.stat().st_size for f in target_dir.rglob('*') if f.is_file()) / (1024 * 1024)
    print(f"\nSuccessfully exported {copied} models to {target_dir}")
    print(f"Total payload size: {total_mb:.2f} MB")
    print(f"\nTo test this folder in the backend, run your command with:")
    print("STEM_MODELS_DIR=server_models")

if __name__ == "__main__":
    main()
