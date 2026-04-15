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

IMPORTANT: This module must run under the project venv Python (sys.executable must
point into .venv/). If the system/user Python has torch>=2.6 installed, the patch
below is applied to the wrong torch and 4-stem fast splits will fail with
UnpicklingError even though the patch is present. Activate the venv first:
  source .venv/bin/activate   (WSL/Ubuntu/Linux)
  .venv\\Scripts\\activate      (Windows)

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


# Demucs model classes that require full unpickling (weights_only=False).
# Allowlisted so PyTorch 2.6+ safe-globals mode can load them without disabling
# weights_only entirely — defence-in-depth: only these specific classes are trusted.
_DEMUCS_SAFE_GLOBALS: tuple[str, ...] = (
    "demucs.htdemucs.HTDemucs",
    "demucs.hdemucs.HDemucs",
    "demucs.demucs.Demucs",
    "demucs.states.DemucsState",
)


def _register_demucs_safe_globals() -> bool:
    """Attempt to allowlist Demucs model classes via torch.serialization.add_safe_globals.

    Returns True when the API is available (PyTorch ≥ 2.4) and all classes were registered.
    Falls back gracefully on older torch versions.
    """
    try:
        import importlib
        import torch.serialization as _ser

        if not hasattr(_ser, "add_safe_globals"):
            return False

        classes: list[type] = []
        for dotted in _DEMUCS_SAFE_GLOBALS:
            module_name, _, class_name = dotted.rpartition(".")
            try:
                mod = importlib.import_module(module_name)
                cls = getattr(mod, class_name)
                classes.append(cls)
            except (ImportError, AttributeError):
                # Class may not exist in all demucs versions — skip silently.
                pass

        if classes:
            _ser.add_safe_globals(classes)
        return True
    except Exception:
        return False


def _patch_torch_load_for_demucs() -> None:
    """Ensure Demucs checkpoints load on PyTorch 2.6+ where weights_only defaults to True.

    Strategy (defence-in-depth, two layers):
    1. Register known Demucs model classes as safe globals so weights_only=True can
       still load them without arbitrary code execution risk.
    2. Patch torch.load to inject weights_only=False as a last-resort fallback for
       any class not covered by the allowlist (e.g. third-party bag checkpoints).

    The patch is applied **always** when using this entry point so that disabling
    ``DEMUCS_TORCH_LOAD_MMAP`` does not silently break checkpoint loading.

    Positional-argument safety: demucs/states.py calls torch.load(path, 'cpu') where
    'cpu' is the map_location positional arg (index 1). We normalise it to a keyword
    argument before injecting weights_only so the signature stays unambiguous.
    """
    import torch

    _register_demucs_safe_globals()

    _real = torch.load
    want_mmap = _mmap_wanted()

    def _load(*args, **kwargs):
        # Normalise positional map_location (torch.load(path, 'cpu')) to keyword form
        # so we can safely inject kwargs without shifting positional indices.
        path_arg = args[0] if args else kwargs.pop("f", None)
        if len(args) > 1:
            kwargs.setdefault("map_location", args[1])
        args = (path_arg,) if path_arg is not None else ()

        # PyTorch 2.6+ defaults weights_only=True; Demucs checkpoints unpickle model classes.
        kwargs.setdefault("weights_only", False)
        # torch.load(mmap=True) requires a string file path on torch 2.2.
        if want_mmap and isinstance(path_arg, str):
            kwargs.setdefault("mmap", True)

        try:
            return _real(*args, **kwargs)
        except TypeError as exc:
            msg = str(exc).lower()
            # Older torch versions do not accept mmap or weights_only — strip and retry.
            if "mmap" in msg:
                kwargs.pop("mmap", None)
                return _real(*args, **kwargs)
            if "weights_only" in msg:
                kwargs.pop("weights_only", None)
                return _real(*args, **kwargs)
            raise
        except Exception as exc:
            # If weights_only=False was rejected (shouldn't happen but guard anyway),
            # retry without it so the original error surfaces cleanly.
            if "weights_only" in str(exc) and kwargs.get("weights_only") is False:
                kwargs.pop("weights_only", None)
                return _real(*args, **kwargs)
            raise

    torch.load = _load  # type: ignore[method-assign]


def _check_torch_version_compatibility() -> None:
    """Warn loudly when torch>=2.6 is detected outside the project venv.

    PyTorch 2.6 changed torch.load(weights_only=...) default to True. The patch in
    this module handles it, but only when this subprocess IS the venv Python. When
    sys.executable points outside .venv/, the patch runs against the wrong torch
    installation and 4-stem fast splits fail with UnpicklingError.
    """
    import sys
    import warnings

    try:
        import torch

        parts = torch.__version__.split("+")[0].split(".")
        major, minor = int(parts[0]), int(parts[1])
        if (major, minor) >= (2, 6):
            exe = sys.executable
            # Heuristic: venv Python paths contain ".venv" or "venv" in their path.
            in_venv = (
                ".venv" in exe
                or "venv" in exe.lower()
                or hasattr(sys, "real_prefix")  # virtualenv
                or (
                    hasattr(sys, "base_prefix")
                    and sys.base_prefix != sys.prefix
                )
            )
            if not in_venv:
                warnings.warn(
                    f"demucs_entry: torch {torch.__version__} detected outside a venv "
                    f"(sys.executable={exe!r}). "
                    "PyTorch 2.6+ defaults weights_only=True; the torch.load patch in "
                    "demucs_entry.py will apply, but if this is the system/user Python "
                    "rather than the project venv, 4-stem fast splits may still fail. "
                    "Activate the project venv: source .venv/bin/activate",
                    RuntimeWarning,
                    stacklevel=2,
                )
    except Exception:
        pass  # Never block startup on a diagnostic check


def main() -> None:
    _check_torch_version_compatibility()
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
