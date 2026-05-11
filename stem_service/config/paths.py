"""Model path resolution and file location utilities.

All path constants and functions that resolve model file locations on disk.
This is a leaf module — no imports from other config sub-modules.
"""

import os
import shutil
from pathlib import Path

# Repo root = parent of stem_service
STEM_SERVICE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = STEM_SERVICE_DIR.parent

# Runtime models root (default ``models/``). For deployment, point at ``server_models/`` after
# building it with ``python scripts/export_server_models.py``.
_models_dir_env = os.environ.get("STEM_MODELS_DIR", "models").strip()
MODELS_DIR = REPO_ROOT / _models_dir_env
MODELS_BY_TYPE_DIR = MODELS_DIR / "models_by_type"

_MODEL_EXT_TO_SUBDIR: dict[str, str] = {
    ".onnx": "onnx",
    ".ort": "ort",
    ".ckpt": "ckpt",
    ".pth": "pth",
    ".th": "th",
    ".safetensors": "safetensors",
    ".yaml": "ckpt",
}


def resolve_models_root_file(name: str) -> Path:
    """Resolve a single weight file under ``models/<name>`` or ``models/models_by_type/<type>/<name>``.

    If both exist, ``models/<name>`` wins so explicit root layout overrides the typed folder.
    """
    direct = MODELS_DIR / name
    if direct.is_file():
        return direct
    sub = (
        "onnx"
        if name.endswith(".onnx.data")
        else _MODEL_EXT_TO_SUBDIR.get(Path(name).suffix.lower())
    )
    if sub:
        typed = MODELS_BY_TYPE_DIR / sub / name
        if typed.is_file():
            return typed
    return direct


# Legacy env hook (diagnostics / scripts).
def speed_2stem_onnx_path() -> Path:
    raw = os.environ.get("SPEED_2STEM_ONNX", "").strip()
    return (
        Path(raw).expanduser()
        if raw
        else resolve_models_root_file("UVR_MDXNET_3_9662.onnx")
    )


# Pip demucs only loads .th from --repo. We support .pth and auto-copy to .th.
HTDEMUCS_PTH = resolve_models_root_file("htdemucs.pth")
HTDEMUCS_TH = resolve_models_root_file("htdemucs.th")
MDX_NET_MODELS_DIR = MODELS_DIR / "MDX_Net_Models"
MDXNET_MODELS_DIR = MODELS_DIR / "mdxnet_models"
SILERO_VAD_ONNX = resolve_models_root_file("silero_vad.onnx")

# SCNet: ONNX under models/scnet_models/ or models/scnet.onnx/; optional PyTorch.
SCNET_MODELS_DIR = MODELS_DIR / "scnet_models"
SCNET_PACKAGED_CONFIG = STEM_SERVICE_DIR / "scnet_musdb_default.yaml"
USE_SCNET = os.environ.get("USE_SCNET", "1").strip().lower() in ("1", "true", "yes")


def get_scnet_onnx_path() -> Path | None:
    """Resolve SCNet ONNX: env SCNET_ONNX, scnet_models/scnet.onnx, nested scnet.onnx/."""
    raw = os.environ.get("SCNET_ONNX", "").strip()
    if raw:
        p = Path(raw).expanduser()
        if p.is_file():
            return p.resolve()
    for p in (
        SCNET_MODELS_DIR / "scnet.onnx",
        MODELS_DIR / "scnet.onnx" / "scnet.onnx",
        MODELS_BY_TYPE_DIR / "onnx" / "scnet.onnx",
    ):
        if p.is_file():
            return p.resolve()
    return None


def scnet_torch_repo_root() -> Path | None:
    raw = os.environ.get("SCNET_REPO", "").strip()
    candidates: list[Path] = []
    if raw:
        candidates.append(Path(raw).expanduser())
    candidates.extend(
        [
            MODELS_DIR / "SCNet",
            MODELS_DIR / "SCNet-main",
            SCNET_MODELS_DIR / "SCNet",
            SCNET_MODELS_DIR / "SCNet-main",
        ]
    )
    for r in candidates:
        try:
            rp = r.resolve()
        except OSError:
            continue
        if (rp / "scnet" / "inference.py").is_file():
            return rp
    return None


def scnet_torch_checkpoint_path() -> Path:
    raw = os.environ.get("SCNET_TORCH_CHECKPOINT", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return (SCNET_MODELS_DIR / "scnet.th").resolve()


def scnet_torch_config_path() -> Path | None:
    raw = os.environ.get("SCNET_TORCH_CONFIG", "").strip()
    if raw:
        p = Path(raw).expanduser().resolve()
        return p if p.is_file() else None
    p = SCNET_MODELS_DIR / "config.yaml"
    if p.is_file():
        return p.resolve()
    if SCNET_PACKAGED_CONFIG.is_file():
        return SCNET_PACKAGED_CONFIG.resolve()
    return None


# Roformer / large .ckpt models: GPU-only.
MDX23C_CKPT = resolve_models_root_file("MDX23C-8KFFT-InstVoc_HQ.ckpt")
BS_ROFORMER_317_CKPT = (
    MODELS_DIR / "MDX_Net_Models" / "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
)
BS_ROFORMER_937_CKPT = resolve_models_root_file(
    "model_bs_roformer_ep_937_sdr_10.5309.ckpt"
)
MEL_BAND_ROFORMER_CKPT = resolve_models_root_file(
    "model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt"
)

# Demucs extra models directory
DEMUCS_EXTRA_MODELS_DIR = MODELS_DIR / "Demucs_Models"


def ensure_htdemucs_th_in_repo(repo: Path, prefer_pth: Path | None = None) -> bool:
    """Ensure repo/htdemucs.th exists so ``demucs -n htdemucs --repo <repo>`` can load it."""
    repo.mkdir(parents=True, exist_ok=True)
    th = repo / "htdemucs.th"
    if th.exists():
        return True
    if prefer_pth is not None and prefer_pth.exists():
        shutil.copy2(prefer_pth, th)
        return True
    pth = repo / "htdemucs.pth"
    if pth.exists():
        shutil.copy2(pth, th)
        return True
    return False


def ensure_htdemucs_th() -> Path | None:
    """Ensure htdemucs.th exists in MODELS_DIR so pip demucs (--repo) can find it.
    If only htdemucs.pth exists, copy it to htdemucs.th once. Returns path to .th or None if no model.
    """
    if HTDEMUCS_TH.exists():
        return HTDEMUCS_TH
    if ensure_htdemucs_th_in_repo(
        MODELS_DIR, prefer_pth=HTDEMUCS_PTH if HTDEMUCS_PTH.exists() else None
    ):
        return HTDEMUCS_TH if HTDEMUCS_TH.exists() else None
    return None
