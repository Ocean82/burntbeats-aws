# Beat-Grid Validation Decision Record

## Scope

This document closes the remaining work for beat-grid quality validation from `docs/roadmap/future-goals.md`.

## Decision 1: Confidence threshold for rendering beat-grid

- Default threshold: `0.30`
- Rule: hide beat-grid overlays when `beat_grid.confidence < 0.30`
- Rationale:
  - Avoid showing likely wrong beat markers on sparse/noisy tracks.
  - Keep timeline readability high for low-signal detections.
  - Preserve user trust: no overlay is better than confidently wrong overlay.

## Decision 2: Fallback strategy

- Keep BPM analysis backend-only.
- Do **not** add a client-side fallback at this stage.
- Rationale:
  - Existing backend pipeline already emits `beat_grid` metadata in completion payloads.
  - Client-side fallback would increase bundle/runtime complexity and duplicate logic.
  - Current product priority is reliability and validation quality, not redundant implementations.

## QA Harness

Use the harness to evaluate real-world tracks:

- Script: `stem_service/scripts/bpm_qa_harness.py`
- Example:

```bash
python -m stem_service.scripts.bpm_qa_harness --input-dir ./qa-audio --out-csv ./qa-output/beat-grid-report.csv --show-progress
```

CSV fields:

- `filename`
- `relative_path`
- `bpm`
- `beat_offset_seconds`
- `confidence`
- `implementation_path`

## Validation notes

- Run QA across:
  - steady tempo songs
  - tempo-drift songs
  - sparse percussion songs
  - low-SNR/noisy recordings
- If confidence is consistently low for a genre/category, keep the threshold and hide overlays for that class until analysis is improved.
