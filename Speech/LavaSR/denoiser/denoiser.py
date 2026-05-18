import torch
import torchaudio

from LavaSR.denoiser.ulunas import ULUNAS
from LavaSR.weights import load_state_dict


class LavaDenoiser:
    def __init__(self, model_path, device="cpu"):
        self.device = device
        self.model = ULUNAS().to(device).eval()

        state_dict = load_state_dict(model_path, map_location=device)
        missing, unexpected = self.model.load_state_dict(state_dict, strict=False)
        if missing:
            raise RuntimeError(f"Denoiser missing keys: {missing[:5]}… ({len(missing)} total)")
        if unexpected:
            raise RuntimeError(
                f"Denoiser unexpected keys: {unexpected[:5]}… ({len(unexpected)} total)"
            )

    def infer(self, wav):

        wav = wav.to(self.device)
        with torch.inference_mode():
            wav = self.model(wav)
          
        return wav
