#!/usr/bin/env python3
"""
Run ranked 2-stem / 4-stem / SCNet variants on a 30s clip from tmp_test (or --input).
4-stem quality/fast use mapped ``.th`` filenames under ``Demucs_Models`` (see ``DEMUCS_*_4STEM_CHECKPOINTS`` in config), not YAML bags, unless you opt back in via env.

By default all outputs go under ``tmp_test/pipeline_matrix_<UTC>/`` next to your test audio.
Override with ``--out`` if you want a different folder.

Each scenario writes a folder with:
  - WAV stems (+ MP3 if ffmpeg is on PATH)
  - run_manifest.json / run_manifest.txt (models, paths, hashes, elapsed seconds)

Usage:
  python scripts/run_pipeline_sample_matrix.py
  python scripts/run_pipeline_sample_matrix.py --input tmp_test/song.mp3 --out tmp/custom_run
  python scripts/run_pipeline_sample_matrix.py --out tmp_test2 --no-scnet
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
os.environ.setdefault("USE_VAD_PRETRIM", "0")


def _utc_iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _utc_iso_now() -> str:
    return _utc_iso(datetime.now(timezone.utc))

logging.basicConfig(level=logging.WARNING)

_PREFIX_HASH_BYTES = 8 * 1024 * 1024
_FULL_HASH_MAX_BYTES = 256 * 1024 * 1024


def _sha256_file(path: Path) -> dict[str, Any]:
    info: dict[str, Any] = {
        "path": str(path.resolve()),
        "name": path.name,
        "suffix": path.suffix.lower(),
        "size_bytes": path.stat().st_size if path.is_file() else None,
    }
    if not path.is_file():
        info["error"] = "missing"
        return info
    sz = info["size_bytes"]
    h = hashlib.sha256()
    with open(path, "rb") as f:
        if sz <= _FULL_HASH_MAX_BYTES:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
            info["sha256"] = h.hexdigest()
        else:
            h.update(f.read(_PREFIX_HASH_BYTES))
            info["sha256_prefix_8mib"] = h.hexdigest()
            info["hash_note"] = "file > 256MiB: prefix hash only"
    return info


def _try_mp3(wav: Path, mp3: Path) -> bool:
    if shutil.which("ffmpeg") is None:
        return False
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(wav),
                "-codec:a",
                "libmp3lame",
                "-qscale:a",
                "2",
                str(mp3),
            ],
            capture_output=True,
            text=True,
            timeout=180,
            check=True,
        )
        return mp3.is_file()
    except (subprocess.CalledProcessError, OSError, subprocess.TimeoutExpired):
        return False


def extract_clip_wav(src: Path, dest: Path, duration_s: float) -> None:
    """Write first ``duration_s`` seconds of ``src`` to ``dest`` as WAV (44.1k stereo int16)."""
    from stem_service.ffmpeg_util import ffmpeg_subprocess_env, resolve_ffmpeg_executable

    dest.parent.mkdir(parents=True, exist_ok=True)
    ff = resolve_ffmpeg_executable()
    if ff is not None:
        subprocess.run(
            [
                str(ff),
                "-y",
                "-i",
                str(src),
                "-t",
                str(duration_s),
                "-ar",
                "44100",
                "-ac",
                "2",
                "-c:a",
                "pcm_s16le",
                str(dest),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=300,
            env=ffmpeg_subprocess_env(),
        )
        return
    import torch
    import torchaudio

    if src.suffix.lower() in (".wav", ".flac", ".ogg", ".aiff", ".aif"):
        import soundfile as sf

        data, sr = sf.read(str(src), always_2d=True, dtype="float32")
        wav = torch.from_numpy(data.T)
    else:
        wav, sr = torchaudio.load(str(src))
    n = max(1, int(duration_s * sr))
    wav = wav[:, :n]
    if sr != 44100:
        wav = torchaudio.functional.resample(wav, sr, 44100)
        sr = 44100
    import numpy as np
    import soundfile as sf

    # Avoid torchaudio.save on hosts where the default backend requires torchcodec.
    ch_first = wav.detach().cpu().numpy()
    mono_or_stereo = np.clip(ch_first.T, -1.0, 1.0)
    sf.write(str(dest), mono_or_stereo, int(sr), subtype="PCM_16")


def _run_timed_wall(fn: Callable[[], None]) -> tuple[float, str, str]:
    """Run ``fn``; return (elapsed_seconds, started_at_utc, finished_at_utc) for server wall-clock estimates."""
    t_start = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    fn()
    elapsed = time.perf_counter() - t0
    t_end = datetime.now(timezone.utc)
    return elapsed, _utc_iso(t_start), _utc_iso(t_end)


def _enrich_model_rows(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ensure each row has ``model_name`` and ``model_path`` for server logs."""
    out: list[dict[str, Any]] = []
    for d in models:
        row = dict(d)
        path_str = row.get("path")
        if path_str:
            row["model_path"] = path_str
            row.setdefault("model_name", row.get("name") or Path(path_str).name)
        elif row.get("logical_name"):
            row["model_name"] = row["logical_name"]
            row["model_path"] = None
        elif row.get("name"):
            row["model_name"] = row["name"]
            row["model_path"] = row.get("path")
        elif row.get("role") == "scnet_repo":
            row["model_name"] = "SCNet_repo"
            row["model_path"] = row.get("path")
        else:
            row.setdefault("model_name", row.get("role", "unknown"))
            row.setdefault("model_path", row.get("path"))
        out.append(row)
    return out


def _base_timing_manifest(
    src: Path,
    clip: Path,
    duration_s: float,
    started: str | None,
    finished: str | None,
    elapsed: float | None,
) -> dict[str, Any]:
    m: dict[str, Any] = {
        "audio_input_file": str(src.resolve()),
        "clip_audio_file": str(clip.resolve()),
        "clip_duration_requested_s": duration_s,
    }
    if started is not None:
        m["started_at_utc"] = started
    if finished is not None:
        m["finished_at_utc"] = finished
    if elapsed is not None:
        m["completion_time_seconds"] = round(elapsed, 3)
    return m


def _write_scenario(
    scenario_dir: Path,
    stems: list[tuple[str, Path]],
    manifest: dict[str, Any],
) -> list[str]:
    scenario_dir.mkdir(parents=True, exist_ok=True)
    names: list[str] = []
    ffmpeg_ok = shutil.which("ffmpeg") is not None
    for stem_id, p in stems:
        if stem_id == "no_vocals":
            stem_id = "instrumental"
        dest = scenario_dir / f"{stem_id}.wav"
        shutil.copy2(p, dest)
        names.append(dest.name)
        if ffmpeg_ok:
            mp3 = dest.with_suffix(".mp3")
            if _try_mp3(dest, mp3):
                names.append(mp3.name)
    manifest["output_audio"] = names
    manifest["ffmpeg_mp3"] = ffmpeg_ok
    manifest["models"] = _enrich_model_rows(manifest.get("models", []))
    with open(scenario_dir / "run_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    with open(scenario_dir / "run_manifest.txt", "w", encoding="utf-8") as f:
        f.write(f"scenario_id: {manifest.get('scenario_id')}\n")
        f.write(f"title: {manifest.get('title')}\n")
        f.write(f"status: {manifest.get('status')}\n")
        f.write(f"audio_input_file: {manifest.get('audio_input_file')}\n")
        f.write(f"clip_audio_file: {manifest.get('clip_audio_file')}\n")
        f.write(f"started_at_utc: {manifest.get('started_at_utc')}\n")
        f.write(f"finished_at_utc: {manifest.get('finished_at_utc')}\n")
        f.write(
            f"completion_time_seconds: {manifest.get('completion_time_seconds', manifest.get('elapsed_seconds'))}\n\n"
        )
        f.write("models (name | path):\n")
        for mo in manifest.get("models", []):
            f.write(
                f"  - {mo.get('model_name')!s} | {mo.get('model_path')!s}\n"
            )
    return names


def _models_from_stage1(names: list[str]) -> list[dict[str, Any]]:
    from stem_service.config import (
        HTDEMUCS_PTH,
        HTDEMUCS_TH,
        MODELS_DIR,
        resolve_models_root_file,
    )
    from stem_service.mdx_onnx import resolve_mdx_model_path, resolve_single_vocal_onnx

    out: list[dict[str, Any]] = []
    for raw in names:
        if raw == "phase_inversion":
            out.append({"role": "instrumental_method", "logical_name": raw})
            continue
        if raw == "audio_separator":
            out.append({"role": "audio_separator", "logical_name": raw})
            continue
        if raw == "htdemucs":
            p = HTDEMUCS_TH if HTDEMUCS_TH.is_file() else HTDEMUCS_PTH
            out.append({"role": "demucs_2stem", **_sha256_file(p)})
            continue
        if raw.endswith((".onnx", ".ort")):
            path = None
            onnx_key = raw if raw.endswith(".onnx") else raw.replace(".ort", ".onnx")
            for c in (
                resolve_models_root_file(onnx_key),
                MODELS_DIR / raw,
                MODELS_DIR / "mdxnet_models" / raw,
            ):
                if c.is_file():
                    path = c
                    break
                r = resolve_mdx_model_path(c)
                if r is not None:
                    path = r
                    break
            if path is None:
                logical = raw if raw.endswith(".onnx") else raw.replace(".ort", ".onnx")
                path = resolve_single_vocal_onnx(logical)
            if path is not None:
                out.append({"role": "onnx", **_sha256_file(path)})
            else:
                out.append({"role": "onnx", "logical_name": raw, "error": "unresolved"})
            continue
        out.append({"role": "unknown", "logical_name": raw})
    return out


@dataclass
class Row:
    scenario_id: str
    title: str
    status: str
    elapsed: float | None
    started_at_utc: str | None = None
    finished_at_utc: str | None = None
    model_names: list[str] = field(default_factory=list)
    model_paths: list[str | None] = field(default_factory=list)
    detail: str = ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", type=Path, default=None)
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output base directory (default: tmp_test/pipeline_matrix_<UTC>/)",
    )
    ap.add_argument("--duration", type=float, default=30.0)
    ap.add_argument(
        "--no-scnet",
        action="store_true",
        help="Skip scenario 09 (SCNet); only 2-stem + 4-stem Demucs matrix scenarios.",
    )
    args = ap.parse_args()

    from stem_service.config import (
        DEMUCS_SEGMENT_SEC,
        USE_SCNET,
        demucs_quality_4stem_configs,
        demucs_speed_4stem_configs,
        get_scnet_onnx_path,
        scnet_torch_available,
    )
    from stem_service.mdx_onnx import resolve_single_vocal_onnx
    from stem_service.phase_inversion import create_perfect_instrumental
    from stem_service.scnet_onnx import (
        run_scnet_onnx_4stem,
        scnet_onnx_runtime_available,
    )
    from stem_service.scnet_torch import run_scnet_torch_4stem
    from stem_service.split import _run_demucs_4stem_named_bag
    from stem_service.runtime_info import get_stem_runtime_versions
    from stem_service.vocal_stage1 import InstrumentalSource, extract_vocals_stage1

    stem_runtime_snapshot = get_stem_runtime_versions()

    if args.input:
        src = args.input.expanduser().resolve()
    else:
        tmp_test = REPO_ROOT / "tmp_test"
        cands: list[Path] = []
        for ext in ("*.mp3", "*.wav", "*.flac", "*.m4a", "*.ogg"):
            cands.extend(tmp_test.glob(ext))
        if not cands:
            print(f"No audio under {tmp_test}; pass --input", file=sys.stderr)
            return 1
        src = sorted(cands, key=lambda p: p.name.lower())[0]

    if not src.is_file():
        print(f"Missing: {src}", file=sys.stderr)
        return 1

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    if args.out:
        op = args.out.expanduser()
        base = op.resolve() if op.is_absolute() else (REPO_ROOT / op).resolve()
    else:
        base = (REPO_ROOT / "tmp_test" / f"pipeline_matrix_{ts}").resolve()
    base.mkdir(parents=True, exist_ok=True)
    clip = base / "sample_30s.wav"
    extract_clip_wav(src, clip, args.duration)
    matrix_t0 = datetime.now(timezone.utc)
    matrix_run_started_at_utc = _utc_iso(matrix_t0)

    summary: list[Row] = []

    def add_summary(
        sid: str,
        title: str,
        status: str,
        elapsed: float | None,
        detail: str = "",
        started_at_utc: str | None = None,
        finished_at_utc: str | None = None,
        models: list[dict[str, Any]] | None = None,
    ) -> None:
        names: list[str] = []
        paths: list[str | None] = []
        if models:
            for mo in _enrich_model_rows(models):
                names.append(str(mo.get("model_name", "")))
                paths.append(mo.get("model_path"))
        summary.append(
            Row(
                sid,
                title,
                status,
                elapsed,
                started_at_utc,
                finished_at_utc,
                names,
                paths,
                detail,
            )
        )

    # --- 2-stem ---
    twostem: list[tuple[str, str, dict[str, Any]]] = [
        (
            "01_2stem_fast_main",
            "2-stem fast main (UVR_MDXNET_3_9662)",
            {
                "prefer_speed": True,
                "model_tier": "fast",
                "vocal_override": resolve_single_vocal_onnx("UVR_MDXNET_3_9662.onnx"),
            },
        ),
        (
            "02_2stem_fast_backup",
            "2-stem fast backup (UVR_MDXNET_KARA)",
            {
                "prefer_speed": True,
                "model_tier": "fast",
                "vocal_override": resolve_single_vocal_onnx("UVR_MDXNET_KARA.onnx"),
            },
        ),
        (
            "03_2stem_quality_main",
            "2-stem quality main (MDX23C first if present, else waterfall)",
            {
                "prefer_speed": False,
                "model_tier": "quality",
                "vocal_override": None,
            },
        ),
    ]
    qb_v = (
        resolve_single_vocal_onnx("Kim_Vocal_2.onnx")
        or resolve_single_vocal_onnx("Kim_Vocal_1.onnx")
        or resolve_single_vocal_onnx("UVR-MDX-NET-Voc_FT.onnx")
    )
    twostem.append(
        (
            "04_2stem_quality_backup",
            "2-stem quality backup (Kim / Voc_FT; tier fast skips MDX23C rank0)",
            {
                "prefer_speed": False,
                "model_tier": "fast",
                "vocal_override": qb_v,
            },
        )
    )

    for sid, title, kw in twostem:
        vo = kw["vocal_override"]
        # Only fast main/backup and quality *backup* require an explicit override path.
        if vo is None and sid != "03_2stem_quality_main":
            add_summary(sid, title, "skipped", None, "required vocal ONNX not on disk")
            d = base / sid
            d.mkdir(parents=True, exist_ok=True)
            (d / "run_manifest.json").write_text(
                json.dumps(
                    {
                        "scenario_id": sid,
                        "title": title,
                        "status": "skipped",
                        "error": "missing vocal model",
                        **_base_timing_manifest(
                            src, clip, args.duration, None, None, None
                        ),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            continue

        scenario_dir = base / sid
        work = scenario_dir / "_work"
        err: str | None = None
        models_used: list[str] = []
        stems: list[tuple[str, Path]] = []

        inst_native: bool | None = None
        inst_src_manifest: InstrumentalSource | None = None

        def job() -> None:
            nonlocal err, models_used, stems, inst_native, inst_src_manifest
            try:
                v, inst, models_used, inst_src = extract_vocals_stage1(
                    clip,
                    work,
                    prefer_speed=kw["prefer_speed"],
                    model_tier=kw["model_tier"],
                    vocal_model_override=kw["vocal_override"],
                )
                inst_src_manifest = inst_src
                inst_native = not inst_src.needs_hybrid_phase_inversion()
                if inst_src.needs_hybrid_phase_inversion():
                    ip = work / "instrumental.wav"
                    create_perfect_instrumental(clip, v, ip)
                    inst = ip
                stems = [("vocals", v), ("instrumental", inst)]
            except Exception as e:
                err = str(e)
                stems = []
                inst_native = None
                inst_src_manifest = None

        elapsed, st, en = _run_timed_wall(job)
        model_list = _enrich_model_rows(_models_from_stage1(models_used))
        manifest = {
            **_base_timing_manifest(src, clip, args.duration, st, en, elapsed),
            "scenario_id": sid,
            "title": title,
            "pipeline": "2-stem",
            "prefer_speed": kw["prefer_speed"],
            "model_tier": kw["model_tier"],
            "elapsed_seconds": round(elapsed, 3),
            "status": "ok" if not err and stems else "error",
            "error": err,
            "source_input": str(src),
            "clip_wav": str(clip),
            "models": model_list,
            "instrumental_from_separate_model_or_demucs": inst_native,
            "instrumental_via_phase_inversion": None
            if inst_src_manifest is None
            else inst_src_manifest.needs_hybrid_phase_inversion(),
            "instrumental_source": (
                inst_src_manifest.value if inst_src_manifest is not None else None
            ),
            "two_stem_note": (
                "UVR/Kim ONNX paths use a single-stem vocal network; instrumental is either "
                "a second ONNX pass (USE_TWO_STEM_INST_ONNX_PASS=1) or hybrid phase inversion. "
                "MDX23C quality: one vocal ONNX plus mix-minus-vocal inside mdx_onnx; "
                "MDX23C balanced: vocal + instrumental ONNX. Demucs uses one model, two outputs."
            ),
        }
        if err or not stems:
            scenario_dir.mkdir(parents=True, exist_ok=True)
            manifest["models"] = _enrich_model_rows(manifest["models"])
            with open(scenario_dir / "run_manifest.json", "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            add_summary(
                sid,
                title,
                "error",
                elapsed,
                err or "no stems",
                st,
                en,
                model_list,
            )
        else:
            _write_scenario(scenario_dir, stems, manifest)
            add_summary(sid, title, "ok", elapsed, "", st, en, model_list)

    # --- 4-stem fast (mapped checkpoints: rank #27 / #28) ---
    speed_cfgs = demucs_speed_4stem_configs()
    fast_labels = [
        ("05_4stem_fast_main", "4-stem fast main (rank #27 mapped .th)"),
        ("06_4stem_fast_backup", "4-stem fast backup (rank #28 mapped .th)"),
    ]
    for i, (sid, title) in enumerate(fast_labels):
        scenario_dir = base / sid
        if i >= len(speed_cfgs):
            add_summary(sid, title, "skipped", None, "speed 4-stem mapping not on disk")
            scenario_dir.mkdir(parents=True, exist_ok=True)
            (scenario_dir / "run_manifest.json").write_text(
                json.dumps(
                    {
                        "scenario_id": sid,
                        "title": title,
                        "status": "skipped",
                        "error": "see DEMUCS_SPEED_4STEM_CHECKPOINTS in stem_service.config",
                        **_base_timing_manifest(
                            src, clip, args.duration, None, None, None
                        ),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            continue
        short, repo, segment, output_subdir, ck = speed_cfgs[i]
        out_work = scenario_dir / "_demucs_out"
        err = None
        stems: list[tuple[str, Path]] = []

        def job4() -> None:
            nonlocal err, stems
            try:
                stems[:] = _run_demucs_4stem_named_bag(
                    clip, out_work, short, repo, segment, output_subdir
                )
            except Exception as e:
                err = str(e)
                stems = []

        elapsed, st, en = _run_timed_wall(job4)
        model_list = _enrich_model_rows(
            [{"role": "demucs_checkpoint", **_sha256_file(ck)}]
        )
        manifest = {
            **_base_timing_manifest(src, clip, args.duration, st, en, elapsed),
            "scenario_id": sid,
            "title": title,
            "pipeline": "4-stem-demucs-speed",
            "demucs_n": short,
            "repo": str(repo.resolve()),
            "segment_sec": segment,
            "elapsed_seconds": round(elapsed, 3),
            "status": "ok" if not err and len(stems) >= 4 else "error",
            "error": err,
            "source_input": str(src),
            "clip_wav": str(clip),
            "models": model_list,
        }
        if err or len(stems) < 4:
            scenario_dir.mkdir(parents=True, exist_ok=True)
            manifest["models"] = _enrich_model_rows(manifest["models"])
            with open(scenario_dir / "run_manifest.json", "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            add_summary(
                sid,
                title,
                "error",
                elapsed,
                err or "incomplete stems",
                st,
                en,
                model_list,
            )
        else:
            _write_scenario(scenario_dir, stems, manifest)
            add_summary(sid, title, "ok", elapsed, "", st, en, model_list)

    # --- 4-stem quality (mapped checkpoints: rank #1 / #2) ---
    qual_cfgs = demucs_quality_4stem_configs()
    qual_labels = [
        (
            "07_4stem_quality_main",
            "4-stem quality main (rank #1 mapped .th in quality_4stem_rank1)",
        ),
        (
            "08_4stem_quality_backup",
            "4-stem quality backup (rank #2 mapped .th in quality_4stem_rank2)",
        ),
    ]
    for i, (sid, title) in enumerate(qual_labels):
        scenario_dir = base / sid
        if i >= len(qual_cfgs):
            add_summary(
                sid,
                title,
                "skipped",
                None,
                "quality 4-stem mapping not on disk",
            )
            scenario_dir.mkdir(parents=True, exist_ok=True)
            (scenario_dir / "run_manifest.json").write_text(
                json.dumps(
                    {
                        "scenario_id": sid,
                        "title": title,
                        "status": "skipped",
                        "error": "see DEMUCS_QUALITY_4STEM_CHECKPOINTS in stem_service.config",
                        **_base_timing_manifest(
                            src, clip, args.duration, None, None, None
                        ),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            continue
        short, repo, segment, output_subdir, ck = qual_cfgs[i]
        out_work = scenario_dir / "_demucs_out"
        err = None
        stems: list[tuple[str, Path]] = []

        def jobq() -> None:
            nonlocal err, stems
            try:
                stems[:] = _run_demucs_4stem_named_bag(
                    clip, out_work, short, repo, segment, output_subdir
                )
            except Exception as e:
                err = str(e)
                stems = []

        elapsed, st, en = _run_timed_wall(jobq)
        model_list = _enrich_model_rows(
            [{"role": "demucs_checkpoint", **_sha256_file(ck)}]
        )
        manifest = {
            **_base_timing_manifest(src, clip, args.duration, st, en, elapsed),
            "scenario_id": sid,
            "title": title,
            "pipeline": "4-stem-demucs-quality-single",
            "demucs_n": short,
            "repo": str(repo.resolve()),
            "segment_sec": segment,
            "elapsed_seconds": round(elapsed, 3),
            "status": "ok" if not err and len(stems) >= 4 else "error",
            "error": err,
            "source_input": str(src),
            "clip_wav": str(clip),
            "models": model_list,
        }
        if err or len(stems) < 4:
            scenario_dir.mkdir(parents=True, exist_ok=True)
            manifest["models"] = _enrich_model_rows(manifest["models"])
            with open(scenario_dir / "run_manifest.json", "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            add_summary(
                sid,
                title,
                "error",
                elapsed,
                err or "incomplete stems",
                st,
                en,
                model_list,
            )
        else:
            _write_scenario(scenario_dir, stems, manifest)
            add_summary(sid, title, "ok", elapsed, "", st, en, model_list)

    # --- SCNet 4-stem ---
    sid = "09_scnet_4stem"
    title = "SCNet 4-stem (PyTorch subprocess or ONNX)"
    scenario_dir = base / sid
    scnet_models: list[dict[str, Any]] = []
    err = None
    stems: list[tuple[str, Path]] = []
    elapsed: float | None = None

    if args.no_scnet:
        add_summary(sid, title, "skipped", None, "--no-scnet")
        scenario_dir.mkdir(parents=True, exist_ok=True)
        (scenario_dir / "run_manifest.json").write_text(
            json.dumps(
                {
                    "scenario_id": sid,
                    "title": title,
                    "status": "skipped",
                    "error": "skipped via --no-scnet",
                    **_base_timing_manifest(
                        src, clip, args.duration, None, None, None
                    ),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    elif not USE_SCNET:
        add_summary(sid, title, "skipped", None, "USE_SCNET=0")
        scenario_dir.mkdir(parents=True, exist_ok=True)
        (scenario_dir / "run_manifest.json").write_text(
            json.dumps(
                {
                    "scenario_id": sid,
                    "title": title,
                    "status": "skipped",
                    "error": "USE_SCNET off",
                    **_base_timing_manifest(
                        src, clip, args.duration, None, None, None
                    ),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    elif scnet_torch_available():
        from stem_service.config import (
            scnet_torch_checkpoint_path,
            scnet_torch_config_path,
            scnet_torch_repo_root,
        )

        repo = scnet_torch_repo_root()
        scnet_models = [
            {"role": "scnet_repo", "path": str(repo) if repo else None},
            {
                "role": "checkpoint",
                **_sha256_file(scnet_torch_checkpoint_path()),
            },
        ]
        cfgp = scnet_torch_config_path()
        if cfgp:
            scnet_models.append({"role": "config", **_sha256_file(cfgp)})
        model_list = _enrich_model_rows(scnet_models)

        def jobs() -> None:
            nonlocal err, stems
            try:
                out_flat = scenario_dir / "_scnet_flat"
                stems[:] = run_scnet_torch_4stem(clip, out_flat, prefer_speed=True) or []
                if not stems:
                    err = "run_scnet_torch_4stem returned None"
            except Exception as e:
                err = str(e)
                stems = []

        elapsed, st, en = _run_timed_wall(jobs)
        manifest = {
            **_base_timing_manifest(src, clip, args.duration, st, en, elapsed),
            "scenario_id": sid,
            "title": title,
            "pipeline": "scnet-pytorch",
            "elapsed_seconds": round(elapsed, 3) if elapsed is not None else None,
            "status": "ok" if not err and len(stems) >= 4 else "error",
            "error": err,
            "source_input": str(src),
            "clip_wav": str(clip),
            "models": model_list,
        }
        if err or len(stems) < 4:
            scenario_dir.mkdir(parents=True, exist_ok=True)
            manifest["models"] = _enrich_model_rows(manifest["models"])
            with open(scenario_dir / "run_manifest.json", "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            add_summary(sid, title, "error", elapsed, err, st, en, model_list)
        else:
            _write_scenario(scenario_dir, stems, manifest)
            add_summary(sid, title, "ok", elapsed, "", st, en, model_list)
    else:
        onnx_p = get_scnet_onnx_path()
        if onnx_p is None or not scnet_onnx_runtime_available():
            reason = "no ONNX path" if onnx_p is None else "ORT self-test failed"
            scnet_models = [{"role": "onnx", "path": str(onnx_p) if onnx_p else None}]
            add_summary(sid, title, "skipped", None, reason)
            scenario_dir.mkdir(parents=True, exist_ok=True)
            (scenario_dir / "run_manifest.json").write_text(
                json.dumps(
                    {
                        "scenario_id": sid,
                        "title": title,
                        "status": "skipped",
                        "error": reason,
                        "models": _enrich_model_rows(scnet_models),
                        **_base_timing_manifest(
                            src, clip, args.duration, None, None, None
                        ),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        else:
            scnet_models = [{"role": "scnet_onnx", **_sha256_file(onnx_p)}]
            model_list = _enrich_model_rows(scnet_models)

            def jobo() -> None:
                nonlocal err, stems
                try:
                    out_flat = scenario_dir / "_scnet_flat"
                    stems[:] = run_scnet_onnx_4stem(clip, out_flat, prefer_speed=True) or []
                    if not stems:
                        err = "run_scnet_onnx_4stem returned None"
                except Exception as e:
                    err = str(e)
                    stems = []

            elapsed, st, en = _run_timed_wall(jobo)
            manifest = {
                **_base_timing_manifest(src, clip, args.duration, st, en, elapsed),
                "scenario_id": sid,
                "title": title,
                "pipeline": "scnet-onnx",
                "elapsed_seconds": round(elapsed, 3),
                "status": "ok" if not err and len(stems) >= 4 else "error",
                "error": err,
                "source_input": str(src),
                "clip_wav": str(clip),
                "models": model_list,
            }
            if err or len(stems) < 4:
                scenario_dir.mkdir(parents=True, exist_ok=True)
                manifest["models"] = _enrich_model_rows(manifest["models"])
                with open(scenario_dir / "run_manifest.json", "w", encoding="utf-8") as f:
                    json.dump(manifest, f, indent=2)
                add_summary(sid, title, "error", elapsed, err, st, en, model_list)
            else:
                _write_scenario(scenario_dir, stems, manifest)
                add_summary(sid, title, "ok", elapsed, "", st, en, model_list)

    matrix_t1 = datetime.now(timezone.utc)
    matrix_run_finished_at_utc = _utc_iso(matrix_t1)
    matrix_total_wall_seconds = round((matrix_t1 - matrix_t0).total_seconds(), 3)
    sum_scenario_seconds = round(
        sum(r.elapsed for r in summary if r.elapsed is not None), 3
    )

    # Summary index (for server capacity planning)
    index = {
        "created_utc": ts,
        "matrix_run_started_at_utc": matrix_run_started_at_utc,
        "matrix_run_finished_at_utc": matrix_run_finished_at_utc,
        "matrix_total_wall_seconds": matrix_total_wall_seconds,
        "sum_scenario_completion_seconds": sum_scenario_seconds,
        "stem_runtime": stem_runtime_snapshot,
        "audio_input_file": str(src.resolve()),
        "clip_audio_file": str(clip.resolve()),
        "clip_duration_requested_s": args.duration,
        "scaling_note": "Times are for the clip length above on this machine. Full songs scale roughly with duration for CPU-bound steps.",
        "runs": [
            {
                "scenario_id": r.scenario_id,
                "title": r.title,
                "status": r.status,
                "started_at_utc": r.started_at_utc,
                "finished_at_utc": r.finished_at_utc,
                "completion_time_seconds": round(r.elapsed, 3)
                if r.elapsed is not None
                else None,
                "elapsed_seconds": round(r.elapsed, 3)
                if r.elapsed is not None
                else None,
                "audio_input_file": str(src.resolve()),
                "clip_audio_file": str(clip.resolve()),
                "models": [
                    {"model_name": n, "model_path": p}
                    for n, p in zip(r.model_names, r.model_paths)
                    if n
                ],
                "detail": r.detail,
            }
            for r in summary
        ],
    }
    (base / "INDEX.json").write_text(json.dumps(index, indent=2), encoding="utf-8")

    csv_path = base / "SERVER_TIMING.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as cf:
        cw = csv.writer(cf)
        cw.writerow(
            [
                "scenario_id",
                "status",
                "started_at_utc",
                "finished_at_utc",
                "completion_time_seconds",
                "model_names_joined",
                "model_paths_joined",
            ]
        )
        for r in summary:
            cw.writerow(
                [
                    r.scenario_id,
                    r.status,
                    r.started_at_utc or "",
                    r.finished_at_utc or "",
                    f"{r.elapsed:.3f}" if r.elapsed is not None else "",
                    ";".join(r.model_names),
                    ";".join("" if p is None else str(p) for p in r.model_paths),
                ]
            )

    lines = [
        f"# Pipeline sample matrix  ({ts})",
        f"**Matrix wall clock:** {matrix_total_wall_seconds}s ({matrix_run_started_at_utc} → {matrix_run_finished_at_utc})",
        f"**Sum of scenario times:** {sum_scenario_seconds}s (parallel-capable steps not parallelized here)",
        f"Source: `{src}`",
        f"Clip: `{clip}` ({args.duration}s)",
        "",
        "| ID | Status | Seconds | Start (UTC) | End (UTC) | Models | Notes |",
        "|----|--------|---------|-------------|-----------|--------|-------|",
    ]
    for r in summary:
        es = f"{r.elapsed:.2f}" if r.elapsed is not None else "-"
        st = r.started_at_utc or "-"
        en = r.finished_at_utc or "-"
        mn = ", ".join(r.model_names) if r.model_names else "-"
        lines.append(
            f"| {r.scenario_id} | {r.status} | {es} | {st} | {en} | {mn.replace('|', '/')} | {r.detail.replace('|', '/')} |"
        )
    (base / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    (base / "2STEM_PIPELINE_NOTES.txt").write_text(
        (
            "2-stem pipeline (stem_service.vocal_stage1.extract_vocals_stage1)\n"
            "================================================================\n"
            "- MDX/UVR vocal ONNX (e.g. UVR_MDXNET_3_9662, KARA, Kim): one network estimates VOCALS only.\n"
            "  They do not emit instrumental in a single forward pass in this integration.\n"
            "- Default: USE_TWO_STEM_INST_ONNX_PASS is off → instrumental = phase inversion (mix − vocals).\n"
            "  Inversion is cheap vs a second full MDX pass; enabling a second inst ONNX is slower, not faster.\n"
            "- MDX23C: two separate ONNX models (vocal + instrumental); both runs succeed → no inversion.\n"
            "- Fallback Demucs htdemucs --two-stems=vocals: one model, native vocals + no_vocals (no inversion).\n"
            "Per-scenario flags are in each run_manifest.json (instrumental_* keys).\n"
        ),
        encoding="utf-8",
    )

    print(json.dumps(index, indent=2))
    print("Wrote:", base)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
