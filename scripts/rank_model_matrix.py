#!/usr/bin/env python3
"""Rank matrix benchmark rows by score/time and by blended composite.

Reads: tmp/model_matrix_benchmark/summary.csv
Writes: ranked_score_time.csv, ranked_blended_q80_s20.csv under the same folder.

Human tier decisions: maintain docs/ranked_practical_time_score.csv (tracked) and
docs/MODEL-SELECTION-AUTHORITY.md — do not rely on blended output alone for product tiers.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path


def folder_for(case: str, backend: str) -> str | None:
    if case == "mdx23c_pair":
        return f"mdx23c_pair_{backend}"
    if case.startswith("vocal:"):
        name = case.split(":", 1)[1].replace(".onnx", "")
        return f"vocal_{name}_{backend}"
    if case.startswith("inst:"):
        name = case.split(":", 1)[1].replace(".onnx", "")
        return f"inst_{name}_{backend}"
    if case.startswith("demucs:"):
        name = case.split(":", 1)[1].replace(".onnx", "")
        return f"demucs_{name}_{backend}"
    return None


def main() -> int:
    root = Path("tmp/model_matrix_benchmark")
    summary = root / "summary.csv"
    out = root / "ranked_score_time.csv"
    out_blended = root / "ranked_blended_q80_s20.csv"
    rows = list(csv.DictReader(summary.open(encoding="utf-8")))
    score_re = re.compile(r"^\s*SCORE\s*=\s*([^\r\n#]+)", re.I | re.M)
    vocals_re = re.compile(r"^\s*VOCALS\s*=\s*([^\r\n#]*)", re.I | re.M)
    inst_re = re.compile(r"^\s*INSTRUMENTALS?\s*=\s*([^\r\n#]*)", re.I | re.M)
    paren_num_re = re.compile(r"\(([0-9]+(?:\.[0-9]+)?)\)")

    ranked: list[dict[str, str | float]] = []
    for r in rows:
        backend = (r.get("backend") or "").strip()
        if backend in ("", "skip"):
            continue
        case = r.get("case") or ""
        d = folder_for(case, backend)

        score_raw = ""
        vocals_raw = ""
        inst_raw = ""
        quality_file = ""
        if d:
            p = root / d
            for nm in ("sound-quality.md", "sound-qulaity.md"):
                f = p / nm
                if f.exists():
                    quality_file = str(f).replace("\\", "/")
                    txt = f.read_text(encoding="utf-8", errors="ignore")
                    m = score_re.search(txt)
                    if m:
                        score_raw = m.group(1).strip()
                    mv = vocals_re.search(txt)
                    if mv:
                        vocals_raw = mv.group(1).strip()
                    mi = inst_re.search(txt)
                    if mi:
                        inst_raw = mi.group(1).strip()
                    break

        if score_raw.upper() in ("", "NA", "NONE"):
            score_num = 0.0
        else:
            try:
                score_num = float(score_raw)
            except ValueError:
                score_num = 0.0

        # If notes indicate the model is mislabeled (e.g. "listed as vocals" but
        # instrumentals line has a usable score in parentheses), use that as
        # effective score and swap role for ranking.
        effective_score = score_num
        effective_case = case
        relabeled = "false"
        mismatch_note = ""
        case_is_vocal = case.startswith("vocal:")
        case_is_inst = case.startswith("inst:")
        if case_is_vocal:
            if "listed as vocals" in inst_raw.lower() or "listed as vocals only" in inst_raw.lower():
                pm = paren_num_re.search(inst_raw)
                if pm:
                    try:
                        effective_score = float(pm.group(1))
                        effective_case = "inst:" + case.split(":", 1)[1]
                        relabeled = "true"
                        mismatch_note = "relabeled vocal->inst using instrumentals note score"
                    except ValueError:
                        pass
        elif case_is_inst:
            if "listed as instrumental" in vocals_raw.lower() or "listed as inst" in vocals_raw.lower():
                pm = paren_num_re.search(vocals_raw)
                if pm:
                    try:
                        effective_score = float(pm.group(1))
                        effective_case = "vocal:" + case.split(":", 1)[1]
                        relabeled = "true"
                        mismatch_note = "relabeled inst->vocal using vocals note score"
                    except ValueError:
                        pass

        elapsed = float(r.get("elapsed_sec") or "1e9")
        model = r.get("model_file") or r.get("vocal_file") or case

        ranked.append(
            {
                "model": str(model),
                "case": case,
                "backend": backend,
                "score_raw": score_raw,
                "score_num": score_num,
                "effective_score_num": effective_score,
                "effective_case": effective_case,
                "relabeled_from_mismatch": relabeled,
                "mismatch_note": mismatch_note,
                "elapsed_sec": elapsed,
                "quality_file": quality_file,
            }
        )

    ranked.sort(key=lambda x: (-float(x["effective_score_num"]), float(x["elapsed_sec"])))
    for i, row in enumerate(ranked, start=1):
        row["rank"] = str(i)
        row["score_num"] = f"{float(row['score_num']):.2f}"
        row["effective_score_num"] = f"{float(row['effective_score_num']):.2f}"
        row["elapsed_sec"] = f"{float(row['elapsed_sec']):.3f}"

    fields = [
        "rank",
        "model",
        "case",
        "effective_case",
        "backend",
        "score_raw",
        "score_num",
        "effective_score_num",
        "relabeled_from_mismatch",
        "mismatch_note",
        "elapsed_sec",
        "quality_file",
    ]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(ranked)

    # Blended ranking:
    # - quality_norm = score / 10
    # - speed_norm = min_elapsed / elapsed (best model gets 1.0)
    # - blended = 0.8 * quality_norm + 0.2 * speed_norm
    elapsed_vals = [float(r["elapsed_sec"]) for r in ranked]
    min_elapsed = min(elapsed_vals) if elapsed_vals else 1.0
    blended_rows = []
    for r in ranked:
        score = float(r["effective_score_num"])
        elapsed = float(r["elapsed_sec"])
        quality_norm = max(0.0, min(1.0, score / 10.0))
        speed_norm = min_elapsed / max(elapsed, 1e-9)
        blended = 0.8 * quality_norm + 0.2 * speed_norm
        blended_rows.append({**r, "_blended": blended, "_quality_norm": quality_norm, "_speed_norm": speed_norm})
    blended_rows.sort(key=lambda x: x["_blended"], reverse=True)
    for i, row in enumerate(blended_rows, start=1):
        row["rank"] = str(i)
        row["quality_norm"] = f"{row['_quality_norm']:.4f}"
        row["speed_norm"] = f"{row['_speed_norm']:.4f}"
        row["blended_score"] = f"{row['_blended']:.4f}"
        row.pop("_blended", None)
        row.pop("_quality_norm", None)
        row.pop("_speed_norm", None)
    blend_fields = [
        "rank",
        "model",
        "case",
        "effective_case",
        "backend",
        "score_raw",
        "score_num",
        "effective_score_num",
        "relabeled_from_mismatch",
        "mismatch_note",
        "elapsed_sec",
        "quality_norm",
        "speed_norm",
        "blended_score",
        "quality_file",
    ]
    with out_blended.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=blend_fields)
        w.writeheader()
        w.writerows(blended_rows)

    print(out)
    print(out_blended)
    print(f"rows={len(ranked)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
