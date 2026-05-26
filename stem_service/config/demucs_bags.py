"""Demucs bag/YAML weight resolution and 4-stem checkpoint configuration.

Handles multi-model YAML bags (htdemucs_ft, quality bags) and single-checkpoint
4-stem Demucs configurations for speed and quality tiers.
"""

import os
import shutil
from pathlib import Path

import yaml

from stem_service.config.paths import (
    DEMUCS_EXTRA_MODELS_DIR,
    MODELS_DIR,
)
from stem_service.config.device import DEMUCS_SEGMENT_SEC

# 4-stem routing is deterministic in the CPU-only pipeline.
FOUR_STEM_BACKEND = "hybrid"

_HTDEMUCS_FT_MODEL_PREFIXES = ("f7e0c4bc", "d12395a8", "92cfc3b6", "04573f0d")
DEMUCS_QUALITY_BAG_FAST_FT_NAME = "04573f0d-f3cf25b2__29d4388e"
DEMUCS_QUALITY_BAG_FAST_FT_YAML = (
    DEMUCS_EXTRA_MODELS_DIR / f"{DEMUCS_QUALITY_BAG_FAST_FT_NAME}.yaml"
)
DEMUCS_SPEED_4STEM_RANK28_REPO = DEMUCS_EXTRA_MODELS_DIR / "speed_4stem_rank28"
DEMUCS_SPEED_4STEM_RANK29_REPO = DEMUCS_EXTRA_MODELS_DIR / "speed_4stem_rank29"

# 4-stem single-checkpoint Demucs: fixed layout under ``Demucs_Models/<subdir>/``.
DEMUCS_SPEED_4STEM_CHECKPOINTS: tuple[tuple[str, str, str], ...] = (
    ("speed_4stem_rank28", "cfa93e08-61801ae1.th", "cfa93e08"),
)
DEMUCS_QUALITY_4STEM_RANK1_REPO = DEMUCS_EXTRA_MODELS_DIR / "quality_4stem_rank1"
DEMUCS_QUALITY_4STEM_CHECKPOINTS: tuple[tuple[str, str, str], ...] = (
    ("quality_4stem_rank1", "04573f0d-f3cf25b2__29d4388e.th", "04573f0d"),
)

DEMUCS_QUALITY_BAG = (os.environ.get("DEMUCS_QUALITY_BAG", "single") or "single").strip()
_DEMUCS_QUALITY_BAG_KEY = DEMUCS_QUALITY_BAG.lower()
_DEPRECATED_MDX_QUALITY_BAGS = frozenset({"mdx_extra_q", "mdx_extra"})


def _demucs_bag_weights_ready(yaml_path: Path) -> bool:
    """True if yaml exists and every model signature in its ``models`` list has a matching ``.th``."""
    if not yaml_path.exists():
        return False
    try:
        with open(yaml_path, encoding="utf-8") as f:
            bag = yaml.safe_load(f)
    except (OSError, yaml.YAMLError):
        return False
    if not bag or "models" not in bag:
        return False
    parent = yaml_path.parent
    for sig in bag["models"]:
        s = str(sig).strip()
        if not s or not any(parent.glob(f"{s}*.th")):
            return False
    return True


def htdemucs_ft_weights_ready(parent: Path | None = None) -> bool:
    root = parent if parent is not None else DEMUCS_EXTRA_MODELS_DIR
    return all(any(root.glob(f"{sig}*.th")) for sig in _HTDEMUCS_FT_MODEL_PREFIXES)


def ensure_htdemucs_ft_yaml() -> Path | None:
    dest = DEMUCS_EXTRA_MODELS_DIR / "htdemucs_ft.yaml"
    if dest.exists():
        return dest
    if not htdemucs_ft_weights_ready():
        return None
    try:
        import demucs

        src = Path(demucs.__file__).resolve().parent / "remote" / "htdemucs_ft.yaml"
        if not src.exists():
            return None
        DEMUCS_EXTRA_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        return dest
    except Exception:
        return None


def _htdemucs_ft_yaml_path() -> Path | None:
    if not htdemucs_ft_weights_ready():
        return None
    p = DEMUCS_EXTRA_MODELS_DIR / "htdemucs_ft.yaml"
    if p.exists() and _demucs_bag_weights_ready(p):
        return p
    p2 = ensure_htdemucs_ft_yaml()
    if p2 is not None and _demucs_bag_weights_ready(p2):
        return p2
    return None


def _auto_quality_bag_candidates() -> list[tuple[str, Path]]:
    ft_yaml = _htdemucs_ft_yaml_path()
    c: list[tuple[str, Path]] = [
        (DEMUCS_QUALITY_BAG_FAST_FT_NAME, DEMUCS_QUALITY_BAG_FAST_FT_YAML),
    ]
    if ft_yaml is not None:
        c.append(("htdemucs_ft", ft_yaml))
    return c


def resolve_demucs_quality_bag() -> tuple[str, Path] | None:
    if _DEMUCS_QUALITY_BAG_KEY in _DEPRECATED_MDX_QUALITY_BAGS:
        return None
    if _DEMUCS_QUALITY_BAG_KEY == "single":
        return None
    if _DEMUCS_QUALITY_BAG_KEY in ("auto", "bags"):
        for name, ypath in _auto_quality_bag_candidates():
            if _demucs_bag_weights_ready(ypath):
                return (name, ypath)
        return None
    if _DEMUCS_QUALITY_BAG_KEY == "htdemucs_ft":
        yp = _htdemucs_ft_yaml_path()
        if yp is not None and _demucs_bag_weights_ready(yp):
            return ("htdemucs_ft", yp)
        return None
    custom = DEMUCS_EXTRA_MODELS_DIR / f"{DEMUCS_QUALITY_BAG}.yaml"
    if _demucs_bag_weights_ready(custom):
        return (DEMUCS_QUALITY_BAG, custom)
    return None


def _segment_for_demucs_yaml_bag(_bag_name: str, yaml_path: Path) -> int:
    try:
        with open(yaml_path, encoding="utf-8") as f:
            bag = yaml.safe_load(f)
    except (OSError, yaml.YAMLError):
        bag = None
    if bag and bag.get("segment") is not None:
        return int(bag["segment"])
    return DEMUCS_SEGMENT_SEC


def get_demucs_quality_bag_config() -> tuple[str, Path, int, str]:
    resolved = resolve_demucs_quality_bag()
    if resolved is None:
        return ("htdemucs", MODELS_DIR, DEMUCS_SEGMENT_SEC, "htdemucs")
    name, yaml_path = resolved
    segment = _segment_for_demucs_yaml_bag(name, yaml_path)
    return (name, DEMUCS_EXTRA_MODELS_DIR, segment, name)


def _resolved_demucs_mapped_ckpt(repo: Path, checkpoint_filename: str) -> Path | None:
    """
    Resolve the checkpoint file under ``repo``.

    Preferred: exactly one ``.th`` whose name equals ``checkpoint_filename``.
    Legacy: if the mapped name uses ``__…`` and only ``<prefix>.th`` exists,
    use that file when it is the sole ``.th``.
    """
    if not repo.is_dir():
        return None
    th_files = sorted(p for p in repo.glob("*.th") if p.is_file())
    if len(th_files) != 1:
        return None
    only = th_files[0]
    if only.name == checkpoint_filename:
        return only
    if "__" in checkpoint_filename:
        legacy_name = checkpoint_filename.split("__", 1)[0] + ".th"
        if only.name == legacy_name:
            return only
    return None


def demucs_speed_4stem_configs() -> list[tuple[str, Path, int, str, Path]]:
    """
    (demucs_n, repo, segment_sec, output_subdir, checkpoint_path).
    Checkpoints: see ``DEMUCS_SPEED_4STEM_CHECKPOINTS``.
    """
    out: list[tuple[str, Path, int, str, Path]] = []
    for subdir, fname, demucs_n in DEMUCS_SPEED_4STEM_CHECKPOINTS:
        repo = DEMUCS_EXTRA_MODELS_DIR / subdir
        ck = _resolved_demucs_mapped_ckpt(repo, fname)
        if ck is not None:
            out.append((demucs_n, repo, DEMUCS_SEGMENT_SEC, demucs_n, ck))
    return out


def demucs_quality_4stem_configs() -> list[tuple[str, Path, int, str, Path]]:
    """
    Deterministic single-checkpoint 4-stem quality.
    (demucs_n, repo, segment_sec, output_subdir, checkpoint_path).
    """
    out: list[tuple[str, Path, int, str, Path]] = []
    for subdir, fname, demucs_n in DEMUCS_QUALITY_4STEM_CHECKPOINTS:
        repo = DEMUCS_EXTRA_MODELS_DIR / subdir
        ck = _resolved_demucs_mapped_ckpt(repo, fname)
        if ck is not None:
            out.append((demucs_n, repo, DEMUCS_SEGMENT_SEC, demucs_n, ck))
    return out
