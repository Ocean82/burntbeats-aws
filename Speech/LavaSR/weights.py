"""Load PyTorch / safetensors checkpoints with optional key prefix stripping."""

from __future__ import annotations

from pathlib import Path

import torch


def _strip_prefix(key: str, prefix: str) -> str:
    if prefix and key.startswith(prefix):
        return key[len(prefix) :]
    return key


def load_state_dict(
    path: str | Path,
    *,
    map_location: str | torch.device = "cpu",
    strip_prefixes: tuple[str, ...] = ("lavasr.",),
) -> dict[str, torch.Tensor]:
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"Weight file not found: {path}")

    suffix = path.suffix.lower()
    if suffix == ".safetensors":
        from safetensors.torch import load_file

        state_dict = load_file(str(path), device=str(map_location))
    elif suffix in (".bin", ".pt", ".pth"):
        state_dict = torch.load(path, map_location=map_location, weights_only=True)
    else:
        raise ValueError(f"Unsupported weight format: {path}")

    cleaned: dict[str, torch.Tensor] = {}
    for key, value in state_dict.items():
        if key.endswith("num_batches_tracked"):
            continue
        new_key = key
        for prefix in strip_prefixes:
            new_key = _strip_prefix(new_key, prefix)
        cleaned[new_key] = value
    return cleaned
