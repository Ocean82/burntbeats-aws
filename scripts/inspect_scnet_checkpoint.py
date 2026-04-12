#!/usr/bin/env python3
"""Print top-level keys of SCNet torch checkpoints (no full load of huge tensors to CPU if avoidable)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("checkpoint", type=Path)
    args = p.parse_args()
    ckpt = args.checkpoint.expanduser().resolve()
    if not ckpt.exists():
        print("missing", ckpt)
        return 1
    import torch

    obj = torch.load(str(ckpt), map_location="cpu", weights_only=False)
    if isinstance(obj, dict):
        print("dict keys:", sorted(obj.keys())[:40])
        for k in ("best_state", "state_dict", "model", "cfg", "config", "args", "hyper_parameters"):
            if k in obj:
                v = obj[k]
                print(f"  [{k}] type={type(v).__name__}")
                if isinstance(v, dict) and len(v) < 30:
                    print(f"       subkeys: {list(v.keys())[:20]}")
        for sd_key in ("state_dict", "best_state"):
            if sd_key not in obj:
                continue
            sd = obj[sd_key]
            if isinstance(sd, dict):
                sk = list(sd.keys())
                print(f"{sd_key} sample keys:", sk[:20], "... total", len(sk))
            else:
                print(f"{sd_key} type", type(sd))
    else:
        print("root type", type(obj))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
