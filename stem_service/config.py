"""Stem service config: repo root and model paths (no external links)."""

import os
import shutil
from pathlib import Path

import yaml

# Repo root = parent of stem_service
STEM_SERVICE_DIR = Path(__file__).resolve().parent
REPO_ROOT = STEM_SERVICE_DIR.parent
MODELS_DIR = REPO_ROOT / "models"
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


# Legacy env hook (diagnostics / scripts). 2-stem Stage 1 uses a fixed rank1→4 waterfall in vocal_stage1.py, not this path.
def speed_2stem_onnx_path() -> Path:
    raw = os.environ.get("SPEED_2STEM_ONNX", "").strip()
    return (
        Path(raw).expanduser()
        if raw
        else resolve_models_root_file("UVR_MDXNET_3_9662.onnx")
    )


# Pip demucs only loads .th from --repo. We support .pth and auto-copy to .th.
# On CPU, prefer htdemucs.th (smaller, faster than .pth); use as optional Stage 3 refinement, not default Stage 1.
HTDEMUCS_PTH = resolve_models_root_file("htdemucs.pth")
HTDEMUCS_TH = resolve_models_root_file("htdemucs.th")
MDX_NET_MODELS_DIR = MODELS_DIR / "MDX_Net_Models"
MDXNET_MODELS_DIR = MODELS_DIR / "mdxnet_models"
SILERO_VAD_ONNX = resolve_models_root_file("silero_vad.onnx")

# SCNet: ONNX under models/scnet_models/ or models/scnet.onnx/; optional PyTorch (see scnet_torch.py).
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


def scnet_torch_available() -> bool:
    repo = scnet_torch_repo_root()
    ck = scnet_torch_checkpoint_path()
    cfg = scnet_torch_config_path()
    return repo is not None and ck.is_file() and cfg is not None


# 4-stem: FOUR_STEM_BACKEND=auto tries PyTorch SCNet, ONNX, then Demucs hybrid.
FOUR_STEM_BACKEND = os.environ.get("FOUR_STEM_BACKEND", "hybrid").strip().lower()
if FOUR_STEM_BACKEND not in ("auto", "hybrid"):
    FOUR_STEM_BACKEND = "hybrid"


def four_stem_skip_scnet() -> bool:
    """When True, 4-stem jobs never attempt SCNet (PyTorch or ONNX)."""
    return FOUR_STEM_BACKEND == "hybrid"


DEMUCS_EXTRA_MODELS_DIR = MODELS_DIR / "Demucs_Models"
_HTDEMUCS_FT_MODEL_PREFIXES = ("f7e0c4bc", "d12395a8", "92cfc3b6", "04573f0d")
DEMUCS_QUALITY_BAG_FAST_FT_NAME = "04573f0d-f3cf25b2__29d4388e"
DEMUCS_QUALITY_BAG_FAST_FT_YAML = (
    DEMUCS_EXTRA_MODELS_DIR / f"{DEMUCS_QUALITY_BAG_FAST_FT_NAME}.yaml"
)
DEMUCS_QUALITY_BAG_BACKUP_NAME = "04573f0d-f3cf25b2__2aad324b"
DEMUCS_QUALITY_BAG_BACKUP_YAML = (
    DEMUCS_EXTRA_MODELS_DIR / f"{DEMUCS_QUALITY_BAG_BACKUP_NAME}.yaml"
)
DEMUCS_SPEED_4STEM_RANK27_REPO = DEMUCS_EXTRA_MODELS_DIR / "speed_4stem_rank27"
DEMUCS_SPEED_4STEM_RANK28_REPO = DEMUCS_EXTRA_MODELS_DIR / "speed_4stem_rank28"

# 4-stem single-checkpoint Demucs: fixed layout under ``Demucs_Models/<subdir>/``.
# Tuple: (subdir under Demucs_Models, checkpoint ``.th`` filename, ``demucs -n`` short id).
# Within-4-stem ranks: fast #27 / #28, quality #1 / #2 (see docs/rankings).
DEMUCS_SPEED_4STEM_CHECKPOINTS: tuple[tuple[str, str, str], ...] = (
    ("speed_4stem_rank27", "d12395a8-e57c48e6__7ae9d6de.th", "d12395a8"),
    ("speed_4stem_rank28", "cfa93e08-61801ae1__7ae9d6de.th", "cfa93e08"),
)
DEMUCS_QUALITY_4STEM_RANK1_REPO = DEMUCS_EXTRA_MODELS_DIR / "quality_4stem_rank1"
DEMUCS_QUALITY_4STEM_RANK2_REPO = DEMUCS_EXTRA_MODELS_DIR / "quality_4stem_rank2"
DEMUCS_QUALITY_4STEM_CHECKPOINTS: tuple[tuple[str, str, str], ...] = (
    ("quality_4stem_rank1", "04573f0d-f3cf25b2__29d4388e.th", "04573f0d"),
    ("quality_4stem_rank2", "04573f0d-f3cf25b2__2aad324b.th", "04573f0d"),
)

# 4-stem quality (CPU-friendly): one ``.th`` per folder, ``demucs -n <short_id> --repo <folder>``.
# Default ``single``: no multi-model YAML bags. Use ``auto`` or ``bags`` to allow ranked YAML bags again.

DEMUCS_QUALITY_BAG = (os.environ.get("DEMUCS_QUALITY_BAG", "single") or "single").strip()
_DEMUCS_QUALITY_BAG_KEY = DEMUCS_QUALITY_BAG.lower()
_DEPRECATED_MDX_QUALITY_BAGS = frozenset({"mdx_extra_q", "mdx_extra"})

USE_DEMUCS_SHIFTS_0 = os.environ.get("USE_DEMUCS_SHIFTS_0", "1").strip().lower() in (
    "1",
    "true",
    "yes",
)

# Roformer / large .ckpt models: GPU-only. Very slow on CPU; do not use in CPU pipeline.
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


def htdemucs_available() -> bool:
    """True if we have a Demucs model (either .pth or .th) for htdemucs."""
    return HTDEMUCS_PTH.exists() or HTDEMUCS_TH.exists()


def scnet_available() -> bool:
    """True if USE_SCNET and an SCNet path exists (ONNX and/or PyTorch)."""
    if not USE_SCNET:
        return False
    if get_scnet_onnx_path() is not None:
        return True
    return scnet_torch_available()


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
        (DEMUCS_QUALITY_BAG_BACKUP_NAME, DEMUCS_QUALITY_BAG_BACKUP_YAML),
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


def demucs_extra_available() -> bool:
    return resolve_demucs_quality_bag() is not None


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
    Legacy: if the mapped name uses ``__…`` and only ``<prefix>.th`` exists (prefix before ``__``),
    use that file when it is the sole ``.th`` — matches older sync layouts.
    """
    if not repo.is_dir():
        return None
    th_files = sorted(p for p in repo.glob("*.th") if p.is_file())
    if len(th_files) != 1:
        return None
    only = th_files[0]
    if only.name == checkpoint_filename:
        return only
    # Legacy short name: ``04573f0d-f3cf25b2.th`` for ``04573f0d-f3cf25b2__….th`` (folder disambiguates rank1 vs rank2).
    if "__" in checkpoint_filename:
        legacy_name = checkpoint_filename.split("__", 1)[0] + ".th"
        if only.name == legacy_name:
            return only
    return None


def _demucs_mapped_checkpoint_ready(repo: Path, checkpoint_filename: str) -> bool:
    return _resolved_demucs_mapped_ckpt(repo, checkpoint_filename) is not None


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


def demucs_speed_4stem_available() -> bool:
    return bool(demucs_speed_4stem_configs())


def demucs_quality_4stem_configs() -> list[tuple[str, Path, int, str, Path]]:
    """
    Single-checkpoint 4-stem quality (rank1 repo then rank2).
    (demucs_n, repo, segment_sec, output_subdir, checkpoint_path).
    """
    out: list[tuple[str, Path, int, str, Path]] = []
    for subdir, fname, demucs_n in DEMUCS_QUALITY_4STEM_CHECKPOINTS:
        repo = DEMUCS_EXTRA_MODELS_DIR / subdir
        ck = _resolved_demucs_mapped_ckpt(repo, fname)
        if ck is not None:
            out.append((demucs_n, repo, DEMUCS_SEGMENT_SEC, demucs_n, ck))
    return out


def demucs_quality_4stem_available() -> bool:
    return bool(demucs_quality_4stem_configs())


def demucs_quality_yaml_bags_allowed() -> bool:
    """False when ``DEMUCS_QUALITY_BAG=single`` — skip multi-model YAML bags for 4-stem quality."""
    return _DEMUCS_QUALITY_BAG_KEY != "single"


def mdx23c_available() -> bool:
    """True if MDX23C model is available for ultra quality."""
    return MDX23C_CKPT.exists()


def bs_roformer_available() -> bool:
    """True if Band-Split Roformer model is available for ultra quality."""
    return BS_ROFORMER_317_CKPT.exists() or BS_ROFORMER_937_CKPT.exists()


def mel_band_roformer_available() -> bool:
    """True if Mel Band Roformer model is available for ultra quality (best quality)."""
    return MEL_BAND_ROFORMER_CKPT.exists()


def mdx23c_vocal_available() -> bool:
    """True if MDX23C vocal ONNX model is available (or sibling ``.ort``)."""
    p = resolve_models_root_file("mdx23c_vocal.onnx")
    ort = p.with_suffix(".ort")
    by_type_ort = MODELS_BY_TYPE_DIR / "ort" / "mdx23c_vocal.ort"
    return p.is_file() or ort.is_file() or by_type_ort.is_file()


def mdx23c_inst_available() -> bool:
    """True if MDX23C instrumental ONNX model is available (or sibling ``.ort``)."""
    p = resolve_models_root_file("mdx23c_instrumental.onnx")
    ort = p.with_suffix(".ort")
    by_type_ort = MODELS_BY_TYPE_DIR / "ort" / "mdx23c_instrumental.ort"
    return p.is_file() or ort.is_file() or by_type_ort.is_file()


def mel_band_roformer_vocal_available() -> bool:
    """True if Mel-Band Roformer vocal ONNX model is available."""
    return resolve_models_root_file("mel_band_roformer_vocals.onnx").is_file()


def mel_band_roformer_inst_available() -> bool:
    """True if Mel-Band Roformer instrumental ONNX model is available."""
    return resolve_models_root_file("mel_band_roformer_instrumental.onnx").is_file()


def bs_roformer_vocal_available() -> bool:
    """True if BS-Roformer vocal ONNX model is available."""
    return resolve_models_root_file("bs_roformer_vocal.onnx").is_file()


def bs_roformer_inst_available() -> bool:
    """True if BS-Roformer instrumental ONNX model is available."""
    return resolve_models_root_file("bs_roformer_instrumental.onnx").is_file()


def get_best_ultra_model() -> Path | None:
    """Return the best available ultra quality model path (GPU-only; avoid on CPU)."""
    if MEL_BAND_ROFORMER_CKPT.exists():
        return MEL_BAND_ROFORMER_CKPT
    elif BS_ROFORMER_317_CKPT.exists():
        return BS_ROFORMER_317_CKPT
    elif BS_ROFORMER_937_CKPT.exists():
        return BS_ROFORMER_937_CKPT
    elif MDX23C_CKPT.exists():
        return MDX23C_CKPT
    return None


def ultra_available_for_device() -> bool:
    """True if an ultra model file exists. Ultra runs on CPU but is slow.
    The caller (ultra.py) raises a clear error if the inference library is missing."""
    return get_best_ultra_model() is not None


def is_cuda_available() -> bool:
    """Check if CUDA GPU is available for accelerated processing."""
    try:
        import torch

        return torch.cuda.is_available()
    except ImportError:
        return False


def get_demucs_device() -> str:
    """Get the best available device for Demucs (cuda if available, else cpu)."""
    return "cuda" if is_cuda_available() else "cpu"


# GPU acceleration setting (auto-detect unless explicitly set)
USE_GPU = os.environ.get("USE_GPU", "auto").strip().lower()
if USE_GPU == "auto":
    DEMUCS_DEVICE = get_demucs_device()
elif USE_GPU in ("1", "true", "yes"):
    DEMUCS_DEVICE = "cuda" if is_cuda_available() else "cpu"
else:
    DEMUCS_DEVICE = "cpu"


# Backend mode: demucs_only | hybrid (hybrid = Stage1 vocals + phase inversion + Stage2 Demucs on instrumental)
STEM_BACKEND = os.environ.get("STEM_BACKEND", "hybrid")
# Pre-trim input to vocal span with Silero VAD (Stage 0). Cheap on CPU; keeps pipeline fast. Default: enabled.
USE_VAD_PRETRIM = os.environ.get("USE_VAD_PRETRIM", "true").strip().lower() in (
    "1",
    "true",
    "yes",
)

# Target sample rate for stem output. Mix alignment and export assume consistent rate (frontend uses 44.1k).
# ONNX vocal path already writes 44100; Demucs uses model native (often 44.1k). Resample to this when adding new writers.
TARGET_SAMPLE_RATE = 44100

# =======================
# Server Configuration
# =======================
DEFAULT_STEM_COUNT = 4
ALLOWED_STEM_COUNTS = (2, 4)
DEFAULT_QUALITY = "quality"  # or "speed" or "ultra"

# Quality tiers
QUALITY_SPEED = "speed"
QUALITY_QUALITY = "quality"
QUALITY_ULTRA = "ultra"

# =======================
# Audio Validation
# =======================
SUPPORTED_AUDIO_FORMATS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aiff"}
MIN_SAMPLE_RATE = 8000
MAX_SAMPLE_RATE = 48000
MAX_FILE_SIZE_MB = 500

# =======================
# Demucs Settings
# =======================
DEMUCS_SHIFTS_SPEED = 0
DEMUCS_SHIFTS_QUALITY = 3
DEMUCS_OVERLAP = 0.25
# htdemucs max segment is 7.8 s; keep <= 7 to stay under the limit.
DEMUCS_SEGMENT_SEC = 7
# demucs.extra bag segment (from mdx_extra_q.yaml)
DEMUCS_EXTRA_SEGMENT = 44
# Timeout for Demucs subprocess (seconds). 10 min default — long songs may need more.
DEMUCS_TIMEOUT_SEC = int(os.environ.get("DEMUCS_TIMEOUT_SEC", "600"))

# Demucs runs as ``python -m …`` subprocess. Use stem_service.demucs_entry for mmap + thread tuning.
_USE_DEMUCS_BOOTSTRAP_RAW = os.environ.get("USE_DEMUCS_BOOTSTRAP", "1").strip().lower()
USE_DEMUCS_BOOTSTRAP = _USE_DEMUCS_BOOTSTRAP_RAW not in ("0", "false", "no", "off")


def demucs_cli_module() -> str:
    """Python module to run as ``python -m <module>`` for Demucs (bootstrap vs stock CLI)."""
    return "stem_service.demucs_entry" if USE_DEMUCS_BOOTSTRAP else "demucs"


def get_onnx_providers() -> list[str]:
    """
    Return ONNX Runtime execution providers in preferred order (GPU when available, else CPU).
    Use for InferenceSession(..., providers=get_onnx_providers()).
    Set USE_ONNX_CPU=1 to force CPU only (e.g. when GPU memory is needed elsewhere).
    """
    if os.environ.get("USE_ONNX_CPU", "").strip().lower() in ("1", "true", "yes"):
        return ["CPUExecutionProvider"]
    try:
        import onnxruntime as ort

        available = set(ort.get_available_providers())
    except ImportError:
        return ["CPUExecutionProvider"]
    # Prefer CUDA, optional OpenVINO (Intel CPU/GPU builds), then CPU.
    order = ["CUDAExecutionProvider"]
    if os.environ.get("USE_ONNX_OPENVINO", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        order.append("OpenVINOExecutionProvider")
    order.append("CPUExecutionProvider")
    return [p for p in order if p in available] or (
        list(available) if available else ["CPUExecutionProvider"]
    )


# =======================
# VAD Settings
# =======================
VAD_PAD_SEC = 0.3
VAD_MAX_GAP_TO_MERGE_SEC = 0.3

# =======================
# VAD Chunking (Option B from VADSLICE-CHUNKED-SEPARATION-INVESTIGATION.md)
# =======================
# Set USE_VAD_CHUNKS=1 to slice the input at silence boundaries before separation.
# Each chunk is processed independently then stems are concatenated.
# Reduces peak memory and enables future parallelization.
USE_VAD_CHUNKS = os.environ.get("USE_VAD_CHUNKS", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)
# Target chunk length in seconds (cut at nearest silence boundary at or after this)
VAD_CHUNK_LENGTH_S = int(os.environ.get("VAD_CHUNK_LENGTH_S", "30"))
# Flush a chunk early if silence gap exceeds this (seconds)
VAD_CHUNK_SILENCE_FLUSH_S = float(os.environ.get("VAD_CHUNK_SILENCE_FLUSH_S", "5.0"))
