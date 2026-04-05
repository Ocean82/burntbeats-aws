"""
Ultra quality tier.

On CPU-only: RoFormer (.ckpt) models require PyTorch + the roformer/music-source-separation
library and are extremely slow (30-120 min per track on a typical CPU). They are NOT
disabled — but they are honest: if the library is not installed or the model fails to
load, this module raises a clear error rather than silently falling back.

To enable ultra on CPU:
  1. pip install music-source-separation  (or equivalent roformer inference lib)
  2. Set USE_ULTRA_ON_CPU=1 in your environment
  3. Expect long processing times (30-120 min for a 4-min track on CPU)

On GPU: ultra runs at reasonable speed (~2-5 min per track).

Available models (in preference order):
  model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt  (~961 MB, best quality)
  model_bs_roformer_ep_317_sdr_12.9755.ckpt          (~610 MB, excellent)
  model_bs_roformer_ep_937_sdr_10.5309.ckpt          (~375 MB, very good)
  MDX_Net_Models/model_bs_roformer_ep_317_sdr_12.9755.ckpt
  MDX_Net_Models/model_bs_roformer_ep_368_sdr_12.9628.ckpt
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Callable

from stem_service.config import (
    MODELS_DIR,
    get_best_ultra_model,
    mdx23c_available,
    mel_band_roformer_available,
    bs_roformer_available,
)

logger = logging.getLogger(__name__)


def get_ultra_model_info() -> dict:
    """Return info about available ultra models and whether they can run."""
    best = get_best_ultra_model()
    return {
        "best_model": str(best) if best else None,
        "mel_band_roformer": mel_band_roformer_available(),
        "bs_roformer": bs_roformer_available(),
        "mdx23c": mdx23c_available(),
        "library_available": _roformer_library_available(),
    }


def _roformer_library_available() -> bool:
    """Check if a roformer inference library is installed."""
    for pkg in ("music_source_separation", "audio_separator", "demucs"):
        try:
            __import__(pkg)
            return True
        except ImportError:
            continue
    return False


def _get_roformer_config(model_path: Path) -> Path | None:
    """Find the YAML config for a roformer checkpoint."""
    cfg_dir = MODELS_DIR / "MDX_Net_Models" / "model_data" / "mdx_c_configs"
    name = model_path.stem
    candidates = [
        cfg_dir / f"{name}.yaml",
        cfg_dir / "model_bs_roformer_ep_317_sdr_12.9755.yaml",
        cfg_dir / "model_mel_band_roformer_ep_3005_sdr_11.4360.yaml",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def _run_roformer_separation(
    input_path: Path,
    vocals_output: Path,
    instrumental_output: Path,
    model_path: Path,
    progress_callback: Callable[[int], None] | None = None,
) -> None:
    """
    Run RoFormer/MelBandRoFormer separation using music-source-separation or
    audio-separator library.

    Raises ImportError if no compatible library is installed.
    Raises RuntimeError if separation fails.
    """
    # Try audio-separator first (pip install audio-separator[cpu])
    try:
        from audio_separator.separator import Separator  # type: ignore

        cfg = _get_roformer_config(model_path)
        sep = Separator(
            model_file_dir=str(model_path.parent),
            output_dir=str(vocals_output.parent),
            output_format="wav",
        )
        sep.load_model(model_filename=model_path.name)
        if progress_callback:
            progress_callback(20)
        output_files = sep.separate(str(input_path))
        if progress_callback:
            progress_callback(80)
        # audio-separator names outputs as {stem}_(Vocals).wav etc.
        for f in output_files:
            fp = Path(f)
            if "Vocals" in fp.name or "vocals" in fp.name.lower():
                shutil.copy2(fp, vocals_output)
            elif "Instrumental" in fp.name or "instrumental" in fp.name.lower():
                shutil.copy2(fp, instrumental_output)
        if not vocals_output.exists():
            raise RuntimeError(
                f"audio-separator did not produce vocals output. Files: {output_files}"
            )
        return
    except ImportError:
        pass

    # Try music-source-separation
    try:
        import yaml
        from music_source_separation.inference import separate  # type: ignore

        cfg_path = _get_roformer_config(model_path)
        if cfg_path is None:
            raise RuntimeError(f"No config YAML found for {model_path.name}")
        with open(cfg_path) as f:
            cfg = yaml.safe_load(f)
        if progress_callback:
            progress_callback(20)
        separate(
            model_path=str(model_path),
            config=cfg,
            input_path=str(input_path),
            vocals_output=str(vocals_output),
            instrumental_output=str(instrumental_output),
            device="cpu",
        )
        if progress_callback:
            progress_callback(80)
        return
    except ImportError:
        pass

    raise ImportError(
        "No roformer inference library found. "
        "Install one of: audio-separator[cpu], music-source-separation. "
        "Example: pip install audio-separator[cpu]"
    )


def run_ultra_4stem(
    input_path: Path,
    output_dir: Path,
    progress_callback: Callable[[int], None] | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Ultra quality 4-stem separation using RoFormer for vocals, then Demucs on instrumental.
    Raises RuntimeError if ultra is not available or fails.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = get_best_ultra_model()
    if model_path is None:
        raise RuntimeError(
            "No ultra quality model found. Place one of the following in models/: "
            "model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt, "
            "model_bs_roformer_ep_317_sdr_12.9755.ckpt, "
            "model_bs_roformer_ep_937_sdr_10.5309.ckpt"
        )

    logger.info("Ultra: using %s", model_path.name)
    vocals_path = output_dir / "ultra_vocals.wav"
    instrumental_path = output_dir / "ultra_instrumental.wav"

    if progress_callback:
        progress_callback(5)

    _run_roformer_separation(
        input_path, vocals_path, instrumental_path, model_path, progress_callback
    )

    if progress_callback:
        progress_callback(50)

    # Stage 2: Demucs on instrumental for drums/bass/other
    from stem_service.split import run_demucs

    stage2_out = output_dir / "stage2"
    stem_files = run_demucs(instrumental_path, stage2_out, stems=4, prefer_speed=False)

    if progress_callback:
        progress_callback(85)

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    result: list[tuple[str, Path]] = []

    dest_vocals = flat_dir / "vocals.wav"
    shutil.copy2(vocals_path, dest_vocals)
    result.append(("vocals", dest_vocals))

    for stem_id, src in stem_files:
        if stem_id == "vocals":
            continue
        dest = flat_dir / f"{stem_id}.wav"
        shutil.copy2(src, dest)
        result.append((stem_id, dest))

    if progress_callback:
        progress_callback(100)
    return result, [model_path.name, "htdemucs"]


def run_ultra_2stem(
    input_path: Path,
    output_dir: Path,
    progress_callback: Callable[[int], None] | None = None,
) -> tuple[list[tuple[str, Path]], list[str]]:
    """
    Ultra quality 2-stem (vocals + instrumental) using RoFormer.
    Applies de-reverb post-pass on vocals when Reverb_HQ model is available.
    Raises RuntimeError if ultra is not available or fails.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = get_best_ultra_model()
    if model_path is None:
        raise RuntimeError("No ultra quality model found.")

    logger.info("Ultra 2-stem: using %s", model_path.name)
    vocals_path = output_dir / "ultra_vocals.wav"
    instrumental_path = output_dir / "ultra_instrumental.wav"

    if progress_callback:
        progress_callback(5)

    _run_roformer_separation(
        input_path, vocals_path, instrumental_path, model_path, progress_callback
    )

    if progress_callback:
        progress_callback(90)

    # De-reverb post-pass on vocals (ultra mode only)
    models_used: list[str] = [model_path.name]
    from stem_service.mdx_onnx import run_dereverb_onnx

    dereverb_out = output_dir / "ultra_vocals_dry.wav"
    dry_path = run_dereverb_onnx(vocals_path, dereverb_out, overlap=0.75)
    if dry_path is not None:
        vocals_path = dry_path
        models_used.append("Reverb_HQ_By_FoxJoy.onnx")
        logger.info("Ultra 2-stem: de-reverb applied to vocal stem")

    flat_dir = output_dir / "stems"
    flat_dir.mkdir(parents=True, exist_ok=True)
    dest_v = flat_dir / "vocals.wav"
    dest_i = flat_dir / "instrumental.wav"
    shutil.copy2(vocals_path, dest_v)
    shutil.copy2(instrumental_path, dest_i)

    if progress_callback:
        progress_callback(100)
    return [("vocals", dest_v), ("instrumental", dest_i)], models_used
