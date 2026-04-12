"""
Run the Demucs CLI in-process with optional CPU tuning.

The stock ``python -m demucs`` path loads checkpoints with plain ``torch.load`` and
inherits whatever thread defaults the environment left unset. This module:

- Applies ``DEMUCS_CPU_THREADS`` / ``TORCH_CPU_THREADS`` to BLAS/OpenMP env vars and
  calls ``torch.set_num_threads`` in the **same** process as Demucs (required because
  we spawn Demucs as a subprocess). Optional ``DEMUCS_INTEROP_THREADS`` sets
  ``torch.set_num_interop_threads``; when intra-op threads are pinned and interop is
  unset, interop defaults to ``1`` to limit oversubscription.
- Patches ``torch.load`` so ``weights_only=False`` for Demucs checkpoints (required on
  PyTorch 2.6+). Optionally adds ``mmap=True`` when ``DEMUCS_TORCH_LOAD_MMAP`` is enabled.

Invoke with the same arguments as Demucs, e.g.::

    python -m stem_service.demucs_entry -n htdemucs --repo models/ track.wav
"""

from __future__ import annotations

import os
import runpy


def _thread_count_from_env() -> int | None:
    raw = (
        os.environ.get("DEMUCS_CPU_THREADS", "").strip()
        or os.environ.get("TORCH_CPU_THREADS", "").strip()
    )
    if not raw.isdigit():
        return None
    n = int(raw)
    return n if n > 0 else None


def _interop_threads_from_env() -> int | None:
    raw = os.environ.get("DEMUCS_INTEROP_THREADS", "").strip()
    if not raw.isdigit():
        return None
    n = int(raw)
    return n if n > 0 else None


def _apply_blas_thread_env(n: str) -> None:
    for key in (
        "OMP_NUM_THREADS",
        "MKL_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "NUMEXPR_NUM_THREADS",
        "VECLIB_MAXIMUM_THREADS",
    ):
        os.environ[key] = n


def _mmap_wanted() -> bool:
    raw = os.environ.get("DEMUCS_TORCH_LOAD_MMAP", "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _patch_torch_load_for_demucs() -> None:
    """Demucs needs full unpickling (HTDemucs/HDemucs classes). PyTorch 2.6+ defaults weights_only=True.

    This patch is applied **always** when using this entry point — not only when mmap is enabled,
    so turning off ``DEMUCS_TORCH_LOAD_MMAP`` does not break checkpoint load.
    """
    import torch

    _real = torch.load
    want_mmap = _mmap_wanted()

    def _load(*args, **kwargs):
        # PyTorch 2.6+ defaults weights_only=True; Demucs checkpoints unpickle model classes.
        if kwargs.get("weights_only") is None:
            kwargs["weights_only"] = False
        if want_mmap and kwargs.get("mmap") is None:
            kwargs["mmap"] = True
        try:
            return _real(*args, **kwargs)
        except TypeError as e:
            msg = str(e).lower()
            if "mmap" in msg and "mmap" in kwargs:
                kwargs.pop("mmap", None)
                return _real(*args, **kwargs)
            if "weights_only" in msg and "weights_only" in kwargs:
                kwargs.pop("weights_only", None)
                return _real(*args, **kwargs)
            raise

    torch.load = _load  # type: ignore[method-assign]


def main() -> None:
    n_threads = _thread_count_from_env()
    if n_threads is not None:
        _apply_blas_thread_env(str(n_threads))

    import torch

    if n_threads is not None:
        torch.set_num_threads(n_threads)

    interop = _interop_threads_from_env()
    if interop is not None:
        try:
            torch.set_num_interop_threads(interop)
        except RuntimeError:
            pass
    elif n_threads is not None:
        try:
            torch.set_num_interop_threads(1)
        except RuntimeError:
            pass

    _patch_torch_load_for_demucs()

    runpy.run_module("demucs", run_name="__main__", alter_sys=True)


if __name__ == "__main__":
    main()
