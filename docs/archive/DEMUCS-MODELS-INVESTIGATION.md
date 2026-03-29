# Demucs models investigation – do the new ones outperform?

**Last updated:** 2026-03-13

## What the app uses today

| Mode | Demucs model | Location | When used |
|------|--------------|---------|-----------|
| **Speed** (and 2-stem) | **htdemucs** | `models/htdemucs.th` (or .pth) | Always when Demucs is needed; single 80 MB model. |
| **Quality** (4-stem only) | **demucs.extra** (bag) | `models/Demucs_Models/mdx_extra_q.yaml` + hashed .th files | When `demucs_extra_available()` is true; bag of 4 smaller models. |

The stem service passes `--repo models/` and `-n htdemucs` or `-n demucs.extra`. The pip package `demucs` resolves these names inside the repo (htdemucs via `htdemucs.th` at repo root; demucs.extra via its own logic, which in our layout is backed by `Demucs_Models/mdx_extra_q.yaml` and the .th files there).

---

## Demucs_Models contents (all bags/singles)

| YAML | Models (hash prefixes) | .th files | Total size (approx) | Notes |
|------|------------------------|-----------|----------------------|------|
| **mdx_extra_q.yaml** | 83fc094f, 464b36d7, 14fc6a69, 7fd6ef75 | 4 files | ~37–51 MB each (~180 MB) | **Current quality bag.** Lighter; segment 44. |
| **mdx_extra.yaml** | e51eebcc, a1d90b5c, 5d2d6c55, cfa93e08 | 4 files | ~159 MB each (~640 MB) | **Heavier bag.** Same segment 44; likely better quality, much slower on CPU. |
| **UVR_Demucs_Model_1.yaml** | ebf34a2db | 1 file | ~159 MB | Single large model. |
| **UVR_Demucs_Model_2.yaml** | ebf34a2d | 1 file | ~159 MB | Single large model. |
| **UVR_Demucs_Model_Bag.yaml** | ebf34a2d, ebf34a2db | 2 files | ~318 MB | 2-model bag. |

Root-level Demucs:

- **htdemucs.th** (~80 MB): single model, fast, good quality. Our default for Speed and fallback when the quality bag is not used.

---

## Could the new(er) Demucs models outperform?

### 1. **mdx_extra (heavy 4-model bag) vs current mdx_extra_q**

- **Current:** mdx_extra_q = 4× ~37–51 MB, ~180 MB total.
- **Heavy:** mdx_extra = 4× ~159 MB, ~640 MB total.
- **Verdict:** The heavy bag (mdx_extra) can **outperform** mdx_extra_q in separation quality (larger capacity, ensemble of bigger models), at the cost of **~3–4× more compute and memory** on CPU. Worth testing as an optional “best quality” Demucs path.

### 2. **UVR_Demucs_Model_1 / Model_2 (single 159 MB) vs htdemucs (80 MB)**

- **htdemucs:** 80 MB, fast, well-tuned default.
- **UVR singles:** 159 MB each; different architecture/training (UVR-style). May be better on some material, worse on others; typically **slower** than htdemucs on CPU.
- **Verdict:** **Possible** quality gain on some tracks; **likely** slower. Worth A/B listening tests if you want a “quality single-model” option.

### 3. **UVR_Demucs_Model_Bag (2×159 MB) vs htdemucs**

- 2-model ensemble, ~318 MB. Can outperform a single model (including htdemucs) when the two models complement each other; again **slower** and more RAM.
- **Verdict:** Could outperform htdemucs for quality at the cost of speed; needs wiring and testing.

### 4. **HP2-4BAND-3090 / Vocal_HP_4BAND_3090**

- These are **not** standard Demucs (they’re 4-band GPU-oriented models). The app does **not** use them. They are **not** recommended for the CPU pipeline (see INVENTORY.md).

---

## Recommendations

1. **Try the heavy bag (mdx_extra) for “best” 4-stem quality**  
   - Add an optional path that uses `mdx_extra.yaml` instead of `mdx_extra_q.yaml` when the user chooses “quality” and a “heavy” or “best” option (e.g. env or UI).  
   - Requires the demucs CLI to accept a model name that resolves to `Demucs_Models/mdx_extra.yaml` (e.g. ensure the package can see it: sometimes the model name in `-n` must match the yaml base name or a known alias).

2. **Keep htdemucs as default for Speed and 2-stem**  
   - Best speed/quality tradeoff on CPU. No change.

3. **Optionally expose UVR Demucs (Model_1, Model_2, or Bag)**  
   - Only if the `demucs` CLI can load them by name from `--repo` (e.g. `UVR_Demucs_Model_1.yaml` → model name `UVR_Demucs_Model_1` or similar). Then add a “quality preset” or env to pick htdemucs vs UVR single vs UVR bag, and run A/B tests.

4. **Do not use HP2/Vocal_HP 3090 models** in the CPU pipeline.

---

## Summary

| Set | Outperform current? | Use for |
|-----|----------------------|--------|
| **mdx_extra (heavy bag)** | Yes, for 4-stem quality | Optional “best quality” when you accept slower CPU. |
| **UVR_Demucs_Model_1/2** | Maybe (material-dependent) | Optional single-model quality; test first. |
| **UVR_Demucs_Model_Bag** | Maybe | Optional 2-model quality; test first. |
| **mdx_extra_q** | (current) | Default quality 4-stem. |
| **htdemucs** | (current) | Default Speed + 2-stem; keep. |

**How to try the heavy bag (mdx_extra):** Run `python -m demucs --repo models/ -n mdx_extra <audio.wav>` to see if the CLI finds `Demucs_Models/mdx_extra.yaml`. If yes, add an env (e.g. `DEMUCS_QUALITY_BAG=mdx_extra`) for an optional best-quality path.

Next step: wire an optional “heavy” quality path that uses the mdx_extra bag (and, if desired, UVR models) and document how to enable it (env or UI).
