#!/usr/bin/env python3
"""
Generate model ranking summaries from benchmark outputs and job_metrics.jsonl.

Usage:
  python scripts/generate_model_ranking.py
  python scripts/generate_model_ranking.py --metrics-file job_metrics.jsonl --benchmark-root benchmark_out --output tmp/model_ranking_report.md
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from statistics import median
from typing import Any

DEFAULT_MAX_RTF_BY_MODE = {
    "2_stem_speed": 1.5,
    "2_stem_quality": 3.0,
    "4_stem_speed": 2.5,
    "4_stem_quality": 5.0,
}

DEFAULT_MIN_RUNS = 5


def _safe_float(value: Any) -> float | None:
    try:
        numeric_value = float(value)
        if numeric_value >= 0:
            return numeric_value
    except (TypeError, ValueError):
        return None
    return None


def _collect_records_from_metrics(metrics_path: Path) -> list[dict[str, Any]]:
    if not metrics_path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line in metrics_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            records.append(payload)
    return records


def _collect_records_from_benchmarks(benchmark_root: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if not benchmark_root.exists():
        return records
    for summary_file in sorted(benchmark_root.glob("**/summary.json")):
        try:
            payload = json.loads(summary_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        runs = payload.get("runs")
        if isinstance(runs, list):
            for run in runs:
                if isinstance(run, dict):
                    records.append(run)
    return records


def _aggregate_rankings(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for record in records:
        mode_name = record.get("mode_name")
        if not isinstance(mode_name, str):
            mode_name = record.get("mode")
        if not isinstance(mode_name, str):
            continue

        models = record.get("models_used")
        if isinstance(models, list):
            model_key = " + ".join(str(item) for item in models if str(item).strip())
        else:
            model_key = str(record.get("run_key", "unknown"))
        if not model_key:
            model_key = "unknown"

        realtime_factor = _safe_float(record.get("realtime_factor"))
        elapsed_seconds = _safe_float(record.get("elapsed_seconds"))
        score_value = realtime_factor if realtime_factor is not None else elapsed_seconds
        if score_value is None:
            continue
        grouped[mode_name][model_key].append(score_value)

    rankings: dict[str, list[dict[str, Any]]] = {}
    for mode_name, model_scores in grouped.items():
        mode_rows: list[dict[str, Any]] = []
        for model_key, scores in model_scores.items():
            mode_rows.append(
                {
                    "model": model_key,
                    "runs": len(scores),
                    "median_score": round(median(scores), 4),
                }
            )
        rankings[mode_name] = sorted(mode_rows, key=lambda row: row["median_score"])
    return rankings


def _pick_recommendations(
    rankings: dict[str, list[dict[str, Any]]],
    max_rtf_by_mode: dict[str, float],
    min_runs: int,
) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []
    for mode_name in sorted(rankings.keys()):
        rows = rankings.get(mode_name, [])
        if not rows:
            continue
        limit = max_rtf_by_mode.get(mode_name)
        selected = rows[0]
        selection_reason = "best median score available"

        candidate_pool = rows
        pool_reason = "all models"
        if limit is not None:
            within_limit = [row for row in rows if row["median_score"] <= limit]
            if within_limit:
                candidate_pool = within_limit
                pool_reason = f"models under max RTF {limit}"
            else:
                selection_reason = f"no model under max RTF {limit}; selected fastest available"

        min_runs_eligible = [row for row in candidate_pool if row["runs"] >= min_runs]
        if min_runs_eligible:
            selected = min_runs_eligible[0]
            selection_reason = (
                f"best median score within {pool_reason} and min runs {min_runs}"
            )
        else:
            selected = candidate_pool[0]
            if selection_reason.startswith("no model under max RTF"):
                selection_reason = f"{selection_reason}; no model met min runs {min_runs}"
            else:
                selection_reason = f"no model met min runs {min_runs}; selected fastest available"

        recommendations.append(
            {
                "mode_name": mode_name,
                "recommended_model": selected["model"],
                "median_score": selected["median_score"],
                "runs": selected["runs"],
                "reason": selection_reason,
            }
        )
    return recommendations


def _build_report(
    rankings: dict[str, list[dict[str, Any]]],
    recommendations: list[dict[str, Any]],
    total_records: int,
    max_rtf_by_mode: dict[str, float],
    min_runs: int,
) -> str:
    lines: list[str] = []
    lines.append("# Model Ranking Report")
    lines.append("")
    lines.append(f"- Records analyzed: {total_records}")
    lines.append("- Ranking metric: `realtime_factor` when available, otherwise `elapsed_seconds`.")
    lines.append("- Recommendation policy: best median score within mode threshold, with a min-runs gate.")
    lines.append("")
    lines.append("## Recommendation thresholds")
    lines.append("")
    lines.append("| Mode | Max target RTF |")
    lines.append("|------|----------------|")
    for mode_name in sorted(max_rtf_by_mode.keys()):
        lines.append(f"| `{mode_name}` | `{max_rtf_by_mode[mode_name]}` |")
    lines.append("")

    lines.append("## Recommendation gate")
    lines.append("")
    lines.append(f"- Min runs per recommended model: `{min_runs}`")
    lines.append("")

    lines.append("## Recommended defaults")
    lines.append("")
    if recommendations:
        lines.append("| Mode | Recommended model(s) | Median score | Runs | Why |")
        lines.append("|------|----------------------|--------------|------|-----|")
        for row in recommendations:
            lines.append(
                f"| `{row['mode_name']}` | `{row['recommended_model']}` | `{row['median_score']}` | `{row['runs']}` | {row['reason']} |"
            )
    else:
        lines.append("No recommendation data available yet.")
    lines.append("")

    if not rankings:
        lines.append("No ranking data found. Run benchmark scripts or execute real jobs first.")
        return "\n".join(lines) + "\n"

    for mode_name in sorted(rankings.keys()):
        lines.append(f"## {mode_name}")
        lines.append("")
        lines.append("| Rank | Model(s) | Median score | Runs |")
        lines.append("|------|----------|--------------|------|")
        for index, row in enumerate(rankings[mode_name], start=1):
            lines.append(
                f"| {index} | `{row['model']}` | `{row['median_score']}` | `{row['runs']}` |"
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate speed ranking from benchmark + job metrics.")
    parser.add_argument(
        "--metrics-file",
        type=Path,
        default=Path("job_metrics.jsonl"),
        help="Path to job metrics JSONL file.",
    )
    parser.add_argument(
        "--benchmark-root",
        type=Path,
        default=Path("."),
        help="Directory to scan recursively for benchmark summary.json files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tmp/model_ranking_report.md"),
        help="Output markdown report path.",
    )
    parser.add_argument(
        "--max-rtf-2-speed",
        type=float,
        default=DEFAULT_MAX_RTF_BY_MODE["2_stem_speed"],
        help="Maximum target RTF for 2_stem_speed recommendations.",
    )
    parser.add_argument(
        "--max-rtf-2-quality",
        type=float,
        default=DEFAULT_MAX_RTF_BY_MODE["2_stem_quality"],
        help="Maximum target RTF for 2_stem_quality recommendations.",
    )
    parser.add_argument(
        "--max-rtf-4-speed",
        type=float,
        default=DEFAULT_MAX_RTF_BY_MODE["4_stem_speed"],
        help="Maximum target RTF for 4_stem_speed recommendations.",
    )
    parser.add_argument(
        "--max-rtf-4-quality",
        type=float,
        default=DEFAULT_MAX_RTF_BY_MODE["4_stem_quality"],
        help="Maximum target RTF for 4_stem_quality recommendations.",
    )
    parser.add_argument(
        "--min-runs",
        type=int,
        default=DEFAULT_MIN_RUNS,
        help="Minimum number of runs required for a model to be eligible for recommended defaults.",
    )
    args = parser.parse_args()

    benchmark_records = _collect_records_from_benchmarks(args.benchmark_root)
    metrics_records = _collect_records_from_metrics(args.metrics_file)
    all_records = benchmark_records + metrics_records
    rankings = _aggregate_rankings(all_records)
    max_rtf_by_mode = {
        "2_stem_speed": args.max_rtf_2_speed,
        "2_stem_quality": args.max_rtf_2_quality,
        "4_stem_speed": args.max_rtf_4_speed,
        "4_stem_quality": args.max_rtf_4_quality,
    }
    recommendations = _pick_recommendations(rankings, max_rtf_by_mode, args.min_runs)
    report = _build_report(
        rankings,
        recommendations,
        len(all_records),
        max_rtf_by_mode,
        args.min_runs,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report, encoding="utf-8")
    print(f"Wrote report: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
