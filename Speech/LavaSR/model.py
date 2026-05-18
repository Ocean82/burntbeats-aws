import os
from pathlib import Path

import torch
import torchaudio

from LavaSR.enhancer.enhancer import LavaBWE
from LavaSR.denoiser.denoiser import LavaDenoiser
from LavaSR.utils import wav_to_1s_batches, load_wav
from LavaSR.enhancer.linkwitz_merge import FastLRMerge


def _resolve_denoiser_weights(model_root: Path) -> Path:
    denoiser_dir = model_root / "denoiser"
    for name in ("denoiser.safetensors", "denoiser.bin"):
        candidate = denoiser_dir / name
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"No denoiser weights under {denoiser_dir} "
        "(expected denoiser.safetensors or denoiser.bin)"
    )


def resolve_model_root(model_path: str | None = None) -> Path:
    """Local weights directory; falls back to SPEECH_MODELS_DIR or ./speech_models."""
    if model_path and model_path not in ("YatharthS/LavaSR",):
        root = Path(model_path)
        if not root.is_dir():
            raise FileNotFoundError(f"SPEECH model path is not a directory: {root}")
        return root

    env_dir = os.environ.get("SPEECH_MODELS_DIR", "").strip()
    if env_dir:
        root = Path(env_dir)
        if root.is_dir():
            return root

    default = Path(__file__).resolve().parents[2] / "speech_models"
    if default.is_dir():
        return default

    raise FileNotFoundError(
        "Speech models not found. Set SPEECH_MODELS_DIR or place weights under speech_models/ "
        "(enhancer_v2/, denoiser/)."
    )


class LavaEnhance:
    def __init__(self, model_path: str | None = None, device="cpu"):
        root = resolve_model_root(model_path)
        self.device = device
        self.bwe_model = LavaBWE(root / "enhancer", device=device)
        self.denoiser_model = LavaDenoiser(_resolve_denoiser_weights(root), device=device)
        

    def enhance(self, wav, enhance=True, denoise=True, batch=False):
        pad_size = 0
        low_quality_audio = wav

        if batch:
            wav, pad_size = wav_to_1s_batches(wav, 16000)

        if denoise:
            with torch.inference_mode():
                wav = self.denoiser_model.infer(wav)
                wav = torchaudio.functional.resample(wav, 16000, 48000)
        else:
            wav = torchaudio.functional.resample(wav, 16000, 48000)
    
        if enhance:
            with torch.no_grad():
                wav = self.bwe_model.infer(wav).reshape(-1)
        else:
            wav = wav.reshape(-1)

        return wav

    def load_audio(self, file_path, input_sr=16000, duration=10000, cutoff=None):
        x = load_wav(file_path, resample_to=input_sr, duration=duration).to(self.device)
        
        if cutoff == None:
            cutoff = input_sr//2
          
        self.bwe_model.lr_refiner = FastLRMerge(device=self.device, cutoff=cutoff, transition_bins=1024)
      
        return x, input_sr

class LavaEnhance2(LavaEnhance):
    def __init__(self, model_path: str | None = None, device="cpu"):
        root = resolve_model_root(model_path)
        self.device = device
        self.bwe_model = LavaBWE(root / "enhancer_v2", device=device)
        self.denoiser_model = LavaDenoiser(_resolve_denoiser_weights(root), device=device)
