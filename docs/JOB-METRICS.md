# Job metrics (models used, duration, realtime factor)

**Date:** 2026-03-16

The stem service records per-job metrics so you can compare which models and modes are actually faster.

## Where metrics are stored

1. **Per job (API + file)**  
   When a job completes, `progress.json` for that job includes:
   - `elapsed_seconds` — wall-clock time for the split
   - `audio_duration_seconds` — length of the source audio (from soundfile)
   - `realtime_factor` — `elapsed_seconds / audio_duration_seconds` (e.g. 2.5 = 2.5× realtime)
   - `stem_count`, `quality_mode`, `prefer_speed`
   - `mode_name` — e.g. `2_stem_speed`, `2_stem_quality`, `4_stem_speed`, `4_stem_quality`, `2_stem_ultra`, `4_stem_ultra`
   - `models_used` — list of model names (e.g. `["Kim_Vocal_2.onnx", "UVR-MDX-NET-Inst_HQ_5.onnx"]`)

2. **Appended log (all jobs)**  
   Each completed job appends one JSON line to **job_metrics.jsonl** (by default at repo root; override with `STEM_METRICS_LOG`).  
   Same fields as above, plus `job_id` and `completed_at` (UTC ISO timestamp).

## Mode names

| mode_name       | Meaning                          |
|-----------------|----------------------------------|
| 2_stem_speed    | 2-stem, quality=speed            |
| 2_stem_quality  | 2-stem, quality=quality          |
| 2_stem_ultra    | 2-stem, quality=ultra            |
| 4_stem_speed    | 4-stem, quality=speed (or from expand) |
| 4_stem_quality  | 4-stem, quality=quality (or from expand) |
| 4_stem_ultra    | 4-stem, quality=ultra            |

Expand jobs (2-stem → 4-stem via `POST /api/stems/expand`) complete with `stem_count: 4` and `expand_from: <source_job_id>` in progress.json; they use the same mode_name as 4-stem (speed/quality) based on the `quality` parameter.

## Realtime factor (RTF)

- **RTF = elapsed_seconds / audio_duration_seconds**
- Example: 3 min song, 90 s processing → RTF = 0.5 (faster than realtime).
- Example: 3 min song, 6 min processing → RTF = 2.0 (2× realtime).
- Lower RTF = faster. Use RTF to compare models/modes on the same or similar track length.

## Comparing models

- **By mode:** Filter `job_metrics.jsonl` by `mode_name` (e.g. `4_stem_quality`) and compare `elapsed_seconds` or `realtime_factor` and `models_used`.
- **By model:** Grep for a model name in `models_used` and average `realtime_factor` or `elapsed_seconds` for similar `audio_duration_seconds`.

Example (bash): list 4-stem quality jobs with RTF and models:

```bash
# One JSON object per line
while IFS= read -r line; do
  echo "$line" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('mode_name') == '4_stem_quality':
  print(d.get('realtime_factor'), d.get('elapsed_seconds'), d.get('audio_duration_seconds'), d.get('models_used'))
"
done < job_metrics.jsonl
```

## Log file location

- Default: `{REPO_ROOT}/job_metrics.jsonl`
- Override: set env `STEM_METRICS_LOG` to the full path of the JSONL file.
- `job_metrics.jsonl` is in `.gitignore` so it is not committed.
