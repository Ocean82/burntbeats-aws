"""
Optional 2-stem path via the ``audio-separator`` CLI (same recipe as ``__model_testing`` stem_bench).

When enabled, runs one subprocess that writes **native** Vocals + Instrumental WAVs — often faster
and slightly different quality than ``run_vocal_onnx`` + phase inversion for MDX-style ONNX models.

Requires a separate install: ``pip install audio-separator`` (not declared in stem_service requirements).
Set ``AUDIO_SEPARATOR_EXE`` if the executable is not on ``PATH``.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

from stem_service.ffmpeg_util import ffmpeg_subprocess_env

logger = logging.getLogger(__name__)


def resolve_audio_separator_exe() -> Path | None:
    raw = os.environ.get("AUDIO_SEPARATOR_EXE", "").strip().strip('"')
    if raw:
        p = Path(raw).expanduser()
        if p.is_file():
            return p
    for name in ("audio-separator", "audio-separator.exe"):
        w = shutil.which(name)
        if w:
            return Path(w)
    return None


def audio_separator_2stem_enabled() -> bool:
    return os.environ.get("USE_AUDIO_SEPARATOR_2STEM", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def audio_separator_timeout_sec() -> int:
    try:
        return max(60, int(os.environ.get("AUDIO_SEPARATOR_TIMEOUT_SEC", "600")))
    except ValueError:
        return 600


def _pick_vocals_instrumental(wavs: list[Path]) -> tuple[Path | None, Path | None]:
    vocal_p: Path | None = None
    inst_p: Path | None = None
    for p in wavs:
        n = p.name.lower()
        if "(vocals)" in n or n.endswith("_vocals.wav") or "_(vocals)_" in n:
            vocal_p = p
        elif "instrumental" in n or "(instrumental)" in n:
            inst_p = p
    if vocal_p is None:
        for p in wavs:
            if p.name.lower().startswith("vocals") or p.stem.lower() == "vocals":
                vocal_p = p
                break
    if inst_p is None:
        for p in wavs:
            if "no_vocals" in p.name.lower():
                inst_p = p
                break
    return vocal_p, inst_p


def run_audio_separator_2stem(
    input_path: Path,
    output_dir: Path,
    model_path: Path,
) -> tuple[Path, Path] | None:
    """
    Run ``audio-separator`` on ``model_path`` (.onnx / .ort). Returns copied
    ``(vocals.wav, instrumental.wav)`` under ``output_dir``, or None on failure.
    """
    exe = resolve_audio_separator_exe()
    if exe is None:
        logger.warning("USE_AUDIO_SEPARATOR_2STEM set but no audio-separator executable found")
        return None
    if not model_path.is_file():
        return None
    suf = model_path.suffix.lower()
    if suf not in (".onnx", ".ort"):
        return None

    work = output_dir / "_audio_separator_work"
    work.mkdir(parents=True, exist_ok=True)
    before = {p.resolve() for p in work.glob("*.wav")}
    env = ffmpeg_subprocess_env()
    cmd = [
        str(exe),
        "-m",
        model_path.name,
        "--model_file_dir",
        str(model_path.parent),
        "--output_dir",
        str(work),
        "--output_format",
        "WAV",
        "--use_soundfile",
        str(input_path),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=audio_separator_timeout_sec(),
            env=env,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        logger.warning("audio-separator subprocess failed: %s", e)
        return None

    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-2000:]
        logger.warning(
            "audio-separator exit %s for %s: %s",
            proc.returncode,
            model_path.name,
            tail,
        )
        return None

    new_wavs = [p for p in work.glob("*.wav") if p.resolve() not in before]
    if not new_wavs:
        new_wavs = sorted(work.glob("*.wav"))
    voc, inst = _pick_vocals_instrumental(new_wavs)
    if voc is None or inst is None or not voc.is_file() or not inst.is_file():
        logger.warning(
            "audio-separator produced no clear Vocals/Instrumental pair in %s (got %s)",
            work,
            [p.name for p in new_wavs],
        )
        return None

    out_v = output_dir / "separator_vocals.wav"
    out_i = output_dir / "separator_instrumental.wav"
    shutil.copy2(voc, out_v)
    shutil.copy2(inst, out_i)
    return out_v, out_i
