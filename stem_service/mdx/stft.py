"""
STFT / iSTFT matching the UVR/audio-separator reference.

Pure math — no I/O, no file reads, no network. Only depends on PyTorch.
These functions are the numeric core of MDX-Net inference.

Key insight: hop_length is ALWAYS 1024 in UVR/MDX-Net — it is NOT n_fft//2.
See docs/MODEL-PARAMS.md for the full parameter mapping.
"""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import torch

_hann_window_cache: dict[int, "torch.Tensor"] = {}
_window_cache_lock = threading.Lock()


def _get_hann_window(n_fft: int) -> "torch.Tensor":
    """Return cached Hann window tensor for repeated STFT/iSTFT calls."""
    with _window_cache_lock:
        existing = _hann_window_cache.get(n_fft)
        if existing is not None:
            return existing
        import torch

        created = torch.hann_window(n_fft, periodic=True)
        _hann_window_cache[n_fft] = created
        return created


def _stft(wav: "torch.Tensor", n_fft: int, hop: int, dim_f: int) -> "torch.Tensor":
    """
    STFT matching the UVR/audio-separator reference (center=True; complex STFT → view_as_real).
    Input:  (batch, 2, samples)
    Output: (batch, 4, dim_f, time_frames)  — [L_real, L_imag, R_real, R_imag], freq truncated to dim_f
    """
    import torch

    window = _get_hann_window(n_fft)
    batch_dims = wav.shape[:-2]
    channels, time_dim = wav.shape[-2], wav.shape[-1]
    reshaped = wav.reshape([-1, time_dim])

    stft_out = torch.stft(
        reshaped,
        n_fft=n_fft,
        hop_length=hop,
        window=window,
        center=True,
        return_complex=True,
    )  # (batch*2, freq, time) complex
    stft_real = torch.view_as_real(stft_out)  # (batch*2, freq, time, 2)

    # permute → (batch*2, 2, freq, time) then reshape → (batch, 4, freq, time)
    perm = stft_real.permute([0, 3, 1, 2])
    out = perm.reshape([*batch_dims, channels, 2, -1, perm.shape[-1]])
    out = out.reshape([*batch_dims, channels * 2, -1, perm.shape[-1]])
    return out[..., :dim_f, :]  # truncate to dim_f freq bins


def _istft(spec: "torch.Tensor", n_fft: int, hop: int) -> "torch.Tensor":
    """
    iSTFT matching the UVR reference.
    Input:  (batch, 4, dim_f, time_frames)  — [L_real, L_imag, R_real, R_imag]
    Output: (batch, 2, samples)
    """
    import torch

    window = _get_hann_window(n_fft)
    batch_dims = spec.shape[:-3]
    channel_dim, freq_dim, time_dim = spec.shape[-3], spec.shape[-2], spec.shape[-1]
    n_bins = n_fft // 2 + 1

    # Pad freq back to n_bins
    if freq_dim < n_bins:
        pad = torch.zeros([*batch_dims, channel_dim, n_bins - freq_dim, time_dim])
        spec = torch.cat([spec, pad], dim=-2)

    # Reshape to separate real/imag and channels
    reshaped = spec.reshape([*batch_dims, channel_dim // 2, 2, n_bins, time_dim])
    flat = reshaped.reshape([-1, 2, n_bins, time_dim])
    perm = flat.permute([0, 2, 3, 1])  # (batch*2, n_bins, time, 2)
    cplx = perm[..., 0] + perm[..., 1] * 1j

    result = torch.istft(cplx, n_fft=n_fft, hop_length=hop, window=window, center=True)
    return result.reshape([*batch_dims, 2, -1])
