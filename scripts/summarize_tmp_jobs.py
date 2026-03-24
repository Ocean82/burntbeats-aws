#!/usr/bin/env python3
"""Build a concise CSV matrix from tmp/stems job logs."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path


UUID_RE = re.compile(
    r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.I,
)


def _read_lines(path: Path) -> list[str]:
    try:
        return path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return []


def _read_progress(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return {"_parse_error": True}


def _extract_quality_note(dir_name: str, log_lines: list[str]) -> str:
    quality_note = ""
    m = UUID_RE.search(dir_name)
    if m:
        prefix = dir_name[: m.start()].strip(" -")
        if prefix:
            quality_note = prefix

    freeform_lines: list[str] = []
    for ln in log_lines:
        s = ln.strip()
        if not s:
            continue
        if s.startswith("{") or re.match(r"^\d{2}:\d{2}:\d{2}\s", s):
            continue
        freeform_lines.append(s)

    if freeform_lines:
        trailing = " | ".join(freeform_lines[-2:])
        quality_note = f"{quality_note} | {trailing}".strip(" |") if quality_note else trailing
    return quality_note


def build_matrix(tmp_stems_dir: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for d in sorted([p for p in tmp_stems_dir.iterdir() if p.is_dir()]):
        m = UUID_RE.search(d.name)
        job_id = m.group(1) if m else d.name
        log_path = d / "job.log"
        progress_path = d / "progress.json"
        log_lines = _read_lines(log_path) if log_path.exists() else []
        progress = _read_progress(progress_path) if progress_path.exists() else {}

        mode = ""
        models_used = ""
        elapsed = ""
        fallback_used = "false"
        anomalies: list[str] = []
        source_job = ""

        for ln in log_lines:
            low = ln.lower()
            if "falling back" in low:
                fallback_used = "true"
            if not mode and "=== job complete" in low:
                mm = re.search(r"mode=([a-z0-9_]+)", ln, re.I)
                if mm:
                    mode = mm.group(1)
            if not mode and "=== expand complete" in low:
                mode = "4_stem_expand"
            if not elapsed and "complete" in low:
                me = re.search(r"elapsed=([0-9]+(?:\.[0-9]+)?)s", ln, re.I)
                if me:
                    elapsed = me.group(1)
            if not models_used and "complete" in low:
                mmu = re.search(r"models=\[([^\]]*)\]", ln, re.I)
                if mmu:
                    models_used = mmu.group(1).replace("'", "").replace('"', "").strip()
            msj = re.search(r"source_job=([0-9a-f\-]{36})", ln, re.I)
            if msj:
                source_job = msj.group(1)

        if not models_used and isinstance(progress, dict):
            mu = progress.get("models_used")
            if isinstance(mu, list):
                models_used = ";".join(str(x) for x in mu)

        if not elapsed and isinstance(progress, dict) and progress.get("elapsed_seconds") is not None:
            elapsed = str(progress.get("elapsed_seconds"))

        if not mode:
            if source_job:
                mode = "4_stem_expand"
            elif (d / "stage1").exists() and (d / "stage2").exists():
                mode = "2_stem_then_expand"
            elif (d / "stage2").exists():
                mode = "4_stem_expand"
            elif (d / "stage1").exists():
                mode = "2_stem"

        if isinstance(progress, dict):
            status = progress.get("status")
            if status and status != "completed":
                anomalies.append(f"progress_status={status}")
            if progress.get("_parse_error"):
                anomalies.append("progress_parse_error")

        if source_job and not (tmp_stems_dir / source_job).exists():
            anomalies.append(f"missing_source_job_dir={source_job}")
        if not models_used:
            anomalies.append("models_used_missing")
        if not elapsed:
            anomalies.append("elapsed_missing")
        if (d / "vocals didnt play stage2").exists():
            anomalies.append("user_note_vocals_didnt_play_stage2")

        quality_note = _extract_quality_note(d.name, log_lines)
        rows.append(
            {
                "job_id": job_id,
                "mode": mode,
                "models_used": models_used,
                "elapsed": elapsed,
                "quality_note": quality_note,
                "fallback_used": fallback_used,
                "anomalies": "|".join(anomalies),
            }
        )
    return rows


def _quality_score(note: str) -> float:
    """
    Convert free-form quality notes into a coarse numeric score.
    Heuristic only: intended for quick human cross-referencing.
    """
    if not note:
        return 0.0
    s = note.lower()

    # Strong positives
    if "keeper" in s:
        return 3.0
    if "great" in s:
        return 3.0
    if "pretty good" in s:
        return 2.0

    # Mild positives
    if "good" in s:
        return 2.0
    if "not bad" in s:
        return 1.0

    # Neutral-ish
    if "just okay" in s or "okay" in s:
        return 0.0

    # Mild negatives
    if "lower quality" in s:
        return -2.0
    if "didnt play" in s:
        return -2.5

    # Strong negatives
    if "trash" in s:
        return -3.0
    if "bad" in s:
        return -3.0
    if "no sound" in s:
        return -4.0

    return 0.0


def _wav_duration_seconds(path_str: str) -> float | None:
    if not path_str:
        return None
    p = Path(path_str)
    if not p.is_file():
        return None
    try:
        import soundfile as sf

        return float(sf.info(str(p)).duration)
    except Exception:
        return None


def build_benchmark_index(tmp_dir: Path) -> list[dict[str, str]]:
    """
    Find developer Demucs ONNX benchmark outputs under tmp/ (BENCHMARK_REPORT.json).
    These are NOT API jobs; do not merge into recommended_defaults quality rankings.
    """
    rows: list[dict[str, str]] = []
    if not tmp_dir.is_dir():
        return rows
    for report_path in sorted(tmp_dir.rglob("BENCHMARK_REPORT.json")):
        rel_parent = report_path.parent.relative_to(tmp_dir)
        try:
            data = json.loads(report_path.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            continue
        inp = data.get("input") or ""
        dur_raw = data.get("audio_duration_seconds")
        dur: float | None = float(dur_raw) if isinstance(dur_raw, (int, float)) else None
        if dur is None:
            dur = _wav_duration_seconds(inp)
        smoke = data.get("smoke_test_only")
        if smoke is None:
            smoke = (dur is not None) and (float(dur) <= 4.5)
        elif isinstance(smoke, str):
            smoke = smoke.lower() in ("1", "true", "yes")
        note = (
            "short_input: use for load/shape only, not quality ranking"
            if smoke
            else "suitable duration for timing/quality spot-checks (still dev benchmark, not API)"
        )
        rows.append(
            {
                "benchmark_dir": str(rel_parent).replace("\\", "/"),
                "input_wav": str(inp),
                "audio_duration_sec": "" if dur is None else f"{float(dur):.3f}",
                "smoke_test_only": "true" if smoke else "false",
                "purpose": "dev_benchmark_not_production_pipeline",
                "note": note,
            }
        )
    return rows


def write_benchmark_runs_csv(tmp_dir: Path, rows: list[dict[str, str]]) -> Path:
    out = tmp_dir / "benchmark_runs.csv"
    fieldnames = [
        "benchmark_dir",
        "input_wav",
        "audio_duration_sec",
        "smoke_test_only",
        "purpose",
        "note",
    ]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    return out


def write_recommended_defaults(tmp_dir: Path, rows: list[dict[str, str]]) -> Path:
    """
    Rank (mode, models_used) from tmp/stems API-style jobs only.
    Excludes benchmark_* indexes — use benchmark_runs.csv for ONNX smoke benchmarks.
    """
    out_path = tmp_dir / "recommended_defaults.csv"

    grouped: dict[tuple[str, str], list[dict[str, str]]] = {}
    for r in rows:
        mode = (r.get("mode") or "").strip()
        models_used = (r.get("models_used") or "").strip()
        elapsed_raw = (r.get("elapsed") or "").strip()
        if not mode or not models_used or not elapsed_raw:
            continue
        try:
            elapsed = float(elapsed_raw)
        except ValueError:
            continue
        _ = elapsed  # silence unused warning in some linters
        grouped.setdefault((mode, models_used), []).append(r)

    def _median(xs: list[float]) -> float:
        if not xs:
            return 0.0
        xs_sorted = sorted(xs)
        n = len(xs_sorted)
        mid = n // 2
        return xs_sorted[mid] if (n % 2 == 1) else (xs_sorted[mid - 1] + xs_sorted[mid]) / 2.0

    summaries: list[dict[str, str]] = []
    for (mode, models_used), group_rows in grouped.items():
        scores = [_quality_score(rr.get("quality_note") or "") for rr in group_rows]
        elapsed_vals = [float(rr.get("elapsed") or "0") for rr in group_rows]
        fallback_rate = sum(
            1.0 if (rr.get("fallback_used") or "").lower() == "true" else 0.0
            for rr in group_rows
        ) / max(1, len(group_rows))

        score_med = _median(scores)
        score_mean = sum(scores) / max(1, len(scores))
        elapsed_med = _median(elapsed_vals)
        elapsed_mean = sum(elapsed_vals) / max(1, len(elapsed_vals))

        summaries.append(
            {
                "mode": mode,
                "models_used": models_used,
                "runs": str(len(group_rows)),
                "quality_score_median": f"{score_med:.2f}",
                "quality_score_mean": f"{score_mean:.2f}",
                "elapsed_median_sec": f"{elapsed_med:.3f}",
                "elapsed_mean_sec": f"{elapsed_mean:.3f}",
                "fallback_rate": f"{fallback_rate:.2f}",
            }
        )

    # Rank per mode (top 3)
    ranked: list[dict[str, str]] = []
    by_mode: dict[str, list[dict[str, str]]] = {}
    for s in summaries:
        by_mode.setdefault(s["mode"], []).append(s)

    for mode, group in by_mode.items():
        is_speed = "speed" in mode
        time_divisor = 8.0 if is_speed else 30.0

        def rank_metric(s: dict[str, str]) -> float:
            score_med = float(s["quality_score_median"])
            elapsed_med = float(s["elapsed_median_sec"])
            fallback_rate = float(s["fallback_rate"])
            return score_med * 10.0 - (elapsed_med / time_divisor) - fallback_rate * 1.0

        group_sorted = sorted(group, key=rank_metric, reverse=True)
        for i, s in enumerate(group_sorted[:3], start=1):
            ranked.append({**s, "recommendation_rank": str(i)})

    fieldnames = [
        "mode",
        "recommendation_rank",
        "models_used",
        "runs",
        "quality_score_median",
        "quality_score_mean",
        "elapsed_median_sec",
        "elapsed_mean_sec",
        "fallback_rate",
    ]

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        # Stable sort for readability
        ranked_sorted = sorted(ranked, key=lambda x: (x["mode"], int(x["recommendation_rank"])))
        w.writerows(ranked_sorted)

    return out_path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    stems_dir = repo_root / "tmp" / "stems"
    out_path = repo_root / "tmp" / "job_matrix.csv"
    rows = build_matrix(stems_dir)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "job_id",
                "mode",
                "models_used",
                "elapsed",
                "quality_note",
                "fallback_used",
                "anomalies",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)
    print(out_path)
    recommended_path = write_recommended_defaults(repo_root / "tmp", rows)
    print(recommended_path)
    bench_rows = build_benchmark_index(repo_root / "tmp")
    bench_path = write_benchmark_runs_csv(repo_root / "tmp", bench_rows)
    print(bench_path)
    print(f"rows={len(rows)} benchmark_reports={len(bench_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
