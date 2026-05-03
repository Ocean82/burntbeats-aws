# Benchmark data (tracked)

These files feed **tier selection**, documentation, and operator scripts. They are **not** read directly by inference at runtime; policy lives in code + [`MODEL-SELECTION-AUTHORITY.md`](../MODEL-SELECTION-AUTHORITY.md).

| File | Purpose |
|------|---------|
| [`ranked_practical_time_score.csv`](ranked_practical_time_score.csv) | Practical wall-clock ranks + subjective tiers on reference material (human-maintained decision table). |
| [`model-ranking-bigmix.csv`](model-ranking-bigmix.csv) | Broader BIGMIX-derived ranking worksheet (referenced in path/selection audits). |
| [`model_ranking_10pt_within_stems.json`](model_ranking_10pt_within_stems.json) | Structured ranking snapshot (within-stems / 10‑pt framing). |

**Maintenance:** Refresh cadence + workflow notes are in [`model-matrix-benchmark-workflow.md`](../model-matrix-benchmark-workflow.md) and `MODEL-SELECTION-AUTHORITY.md`.
