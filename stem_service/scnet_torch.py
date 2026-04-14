"""
PyTorch SCNet 4-stem separation via the official starrytong/SCNet ``scnet.inference`` CLI.

Requires: clone https://github.com/starrytong/SCNet, set ``SCNET_REPO`` to the clone root
(or place the repo at ``models/SCNet``, ``models/scnet_models/SCNet-main``, etc.), checkpoint
``models/scnet_models/scnet.th`` (or ``SCNET_TORCH_CHECKPOINT``), and optionally
``models/scnet_models/config.yaml`` (else ``stem_service/scnet_musdb_default.yaml``).
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from stem_service.config import (
    DEMUCS_TIMEOUT_SEC,
    scnet_torch_available,
    scnet_torch_checkpoint_path,
    scnet_torch_config_path,
    scnet_torch_repo_root,
)

logger = logging.getLogger(__name__)

RETURN_ORDER = ("vocals", "drums", "bass", "other")


def run_scnet_torch_4stem(
    input_path: Path,
    output_dir: Path,
    prefer_speed: bool = True,
) -> list[tuple[str, Path]] | None:
    """
    Run SCNet via subprocess. Returns stems in RETURN_ORDER or None on failure.
    ``prefer_speed`` is accepted for API parity with ONNX; upstream overlap is fixed in SCNet.
    """
    del prefer_speed
    if not scnet_torch_available():
        return None

    repo = scnet_torch_repo_root()
    checkpoint = scnet_torch_checkpoint_path()
    config = scnet_torch_config_path()
    if repo is None or config is None:
        logger.warning(
            "scnet_torch: repo or config unavailable (repo=%s, config=%s)",
            repo,
            config,
        )
        return None

    input_path = input_path.resolve()
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        with tempfile.TemporaryDirectory(prefix="scnet_torch_") as tmp:
            tdir = Path(tmp)
            in_dir = tdir / "in"
            out_dir = tdir / "out"
            in_dir.mkdir(parents=True)
            out_dir.mkdir(parents=True)
            wav_name = "scnet_mix.wav"
            shutil.copy2(input_path, in_dir / wav_name)

            env = os.environ.copy()
            extra = str(repo.resolve())
            prev = env.get("PYTHONPATH", "")
            env["PYTHONPATH"] = extra if not prev else f"{extra}{os.pathsep}{prev}"

            cmd = [
                sys.executable,
                "-m",
                "scnet.inference",
                "--input_dir",
                str(in_dir),
                "--output_dir",
                str(out_dir),
                "--config_path",
                str(config),
                "--checkpoint_path",
                str(checkpoint),
            ]
            proc = subprocess.run(
                cmd,
                cwd=str(repo),
                env=env,
                capture_output=True,
                text=True,
                timeout=DEMUCS_TIMEOUT_SEC,
            )
            if proc.returncode != 0:
                err = (proc.stderr or proc.stdout or "").strip()
                logger.warning(
                    "scnet_torch: inference failed (code=%s): %s",
                    proc.returncode,
                    err[:2000] if err else "(no output)",
                )
                return None

            stem_dir = out_dir / Path(wav_name).stem
            result: list[tuple[str, Path]] = []
            for stem_id in RETURN_ORDER:
                src = stem_dir / f"{stem_id}.wav"
                if not src.is_file():
                    logger.warning("scnet_torch: missing output %s", src)
                    return None
                dest = output_dir / f"{stem_id}.wav"
                shutil.copy2(src, dest)
                result.append((stem_id, dest))
            return result
    except Exception as e:
        logger.warning("scnet_torch: %s", e)
        return None
