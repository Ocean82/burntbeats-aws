## Proposed work
## This BWE model is based on Vocos, excellant speed with good quality.

import types
from pathlib import Path

import torch
from torch.cuda.amp import autocast as autocast_func
from vocos import Vocos

from LavaSR.enhancer.linkwitz_merge import FastLRMerge
from LavaSR.weights import load_state_dict

## quick monkey patch to improve quality slightly
def custom_forward(self, x: torch.Tensor) -> torch.Tensor:
    """
    Forward pass of the ISTFTHead module.

    Args:
        x (Tensor): Input tensor of shape (B, L, H)

    Returns:
        Tensor: Reconstructed time-domain audio signal
    """
    x = self.out(x).transpose(1, 2)
    mag, p = x.chunk(2, dim=1)
    mag = torch.exp(mag)
    mag = torch.clip(mag, max=1e3)
    x_real = torch.cos(p)
    x_imag = torch.sin(p)
    S = mag * (x_real + 1j * x_imag)
    audio = self.istft(S)
    return audio
  
def _resolve_bwe_weights(model_dir: Path) -> Path:
    for name in ("model.safetensors", "pytorch_model.bin"):
        candidate = model_dir / name
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"No enhancer weights in {model_dir} (expected model.safetensors or pytorch_model.bin)"
    )


class LavaBWE:
    def __init__(self, model_path, device="cpu"):
        self.device = device
        self.lr_refiner = FastLRMerge(device=device)

        model_dir = Path(model_path)
        config_path = model_dir / "config.yaml"
        if not config_path.is_file():
            raise FileNotFoundError(f"Missing Vocos config: {config_path}")

        weights_path = _resolve_bwe_weights(model_dir)
        state_dict = load_state_dict(weights_path, map_location="cpu")
        self.bwe_model = Vocos.from_hparams(str(config_path))
        missing, unexpected = self.bwe_model.load_state_dict(state_dict, strict=False)
        if missing:
            raise RuntimeError(f"Enhancer missing keys: {missing[:5]}… ({len(missing)} total)")
        if unexpected:
            raise RuntimeError(
                f"Enhancer unexpected keys: {unexpected[:5]}… ({len(unexpected)} total)"
            )
        self.bwe_model = self.bwe_model.eval().to(device)
    
        self.bwe_model.head.forward = types.MethodType(custom_forward, self.bwe_model.head)

        

    def infer(self, wav, autocast=False):
        """Inference function for bwe"""
      
        wav = wav.to(self.device)
        with torch.no_grad(), torch.autocast(self.device, dtype=torch.float16, enabled=autocast):
            features_input = self.bwe_model.feature_extractor(wav)
            features = self.bwe_model.backbone(features_input)
            pred_audio = self.bwe_model.head(features)
            with autocast_func(enabled=False):
                pred_audio = self.lr_refiner(pred_audio[:, :wav.shape[1]].float(), wav[:, :pred_audio.shape[1]].float())

        return pred_audio



