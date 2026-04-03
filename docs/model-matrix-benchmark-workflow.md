# Model matrix benchmark → ranked CSVs

Large outputs live under **`tmp/`** (gitignored). This is the usual flow:

1. **Run the matrix** so each case writes under `tmp/model_matrix_benchmark/<case>/` (including `sound-quality.md` / `sound-qulaity.md` and timing).
2. **Aggregate:** `tmp/model_matrix_benchmark/summary.csv` is the combined run summary when your benchmark driver produces it.
3. **Rank (generated):** from the repo root:

   ```bash
   python scripts/rank_model_matrix.py
   ```

   This writes ranked tables under `tmp/model_matrix_benchmark/` (e.g. `ranked_score_time.csv`, `ranked_blended_q80_s20.csv`) when `tmp/` is writable.

4. **Product table (tracked):** refresh **`docs/ranked_practical_time_score.csv`** by hand or script from scores + elapsed — see **`docs/MODEL-SELECTION-AUTHORITY.md`**.

**Note:** If `tmp/` is missing locally, create it before running benchmarks; nothing in git depends on those paths.
