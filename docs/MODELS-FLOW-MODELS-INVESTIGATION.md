# models/flow-models — Investigation and Upgrade Opportunities

**Date:** 2026-03-09  
**Purpose:** Audit `models/flow-models` and how it can upgrade the stem splitter (htdemucs, ONNX, etc.).

---

## 1. Why Demucs failed: format and `.th`

The pip package **demucs** only discovers **`.th`** files in a local `--repo` and expects a **full package** (keys: `klass`, `args`, `kwargs`, `state`), not a raw state_dict. Many third-party or flow-models `.pth`/`.th` files are state_dict-only → `KeyError: 'klass'`.

- **Recommended:** Use the **official** Facebook checkpoint. Run once: `python scripts/download_htdemucs_official.py` (saves `models/htdemucs.th` from `dl.fbaipublicfiles.com/demucs/.../955717e8-8726e21a.th`). Then run E2E tests: `bash scripts/test-stem-splits.sh` (WSL).
- **PyTorch 2.6:** If you see `Weights only load failed` / `Unsupported global: GLOBAL demucs.htdemucs.HTDemucs`, the installed demucs uses `torch.load(..., weights_only=True)` by default. Patch `.venv/.../demucs/states.py` so the load line uses `weights_only=False` (trusted official checkpoint).
- **Segment length:** Official htdemucs has a max segment of 7.8 s. The app uses `--segment 7` in `split.py` and `vocal_stage1.py` so the CLI gets an integer and stays under the limit.
- **Legacy:** If you have a compatible `.pth` (full package), the app can copy it to `htdemucs.th`; `scripts/copy-models.sh` can copy from a stem-models bank. Prefer the download script for a known-good model.

---

## 2. Where the app looks for htdemucs

| What | Path |
|------|------|
| Preferred / user copy | `models/htdemucs.pth` |
| What Demucs (pip) uses | `models/htdemucs.th` (same content; created from .pth if needed) |
| Config | `stem_service/config.py`: `HTDEMUCS_PTH`, `HTDEMUCS_TH`, `ensure_htdemucs_th()`, `htdemucs_available()` |

All paths are under the repo; no references to `D:\` or external stem-models in code.

---

## 3. flow-models layout (summary + full subdirectory audit)

`models/flow-models/` contains research/generation code, configs, and **actual checkpoint files** (found via full recursive scan of subdirectories):

| Area | Contents | Relevance to stem splitter |
|------|----------|----------------------------|
| **flow-models/demucs/** | Custom Demucs (Tencent-style): `run.py`, `models/htdemucs.py`, `ckpt/htdemucs.yaml` | Expects `htdemucs.pth` + `htdemucs.yaml` in a `demucs/ckpt/`-style layout. Uses `.pth` and a custom `get_model_from_yaml`. **Not** the same as pip demucs. |
| **flow-models/flow-ckpt/** | `htdemucs.yaml` (bag: `models: ['htdemucs']`) | Config only; no checkpoint files in repo. |
| **flow-models/Flow1dVAE/** | MERT, BSRNN-VAE, HiFi-GAN, EnCodec, septoken generation, etc. | Audio representation/generation research. Not a drop-in stem separator. Could inform future “quality” or GPU pipelines. |

**Actual model files found (full subdirectory scan):**

- **flow-models/htdemucs.pth** (~168 MB) — at flow-models root. **Use this:** copy to `models/htdemucs.pth` so the stem splitter works.
- **flow-models/demucs/ckpt/EMBER-DEMUCS-SEPARATOR-ALT.pth** (~168 MB) — flow-models `run.py` expects `htdemucs.pth` here (name mismatch).
- **flow-models/flow-ckpt/EMBER-DEMUCS-SEPARATOR-ALT.pth** + htdemucs.yaml — same checkpoint, different dir.
- **flow-models/vae/autoencoder_music_1320k.ckpt** (~675 MB) — Stable Audio-style VAE for Flow1dVAE generation.

Other subdirs: **autoencoders/** (VAE JSON configs), **config/** (model_1920.json, model_config.json), **dac/** (Descript Audio Codec package), **Flow1dVAE/** (MERT, BSRNN-VAE, tools, our_MERT_BESTRQ).

**Quick win (official model):** From repo root (WSL): `python scripts/download_htdemucs_official.py` — then run the stem splitter and tests. Do not rely on flow-models `htdemucs.pth` for the pip demucs backend unless it is in the full package format.

---

## 4. Upgrade opportunities

### A. Use flow-models Demucs checkpoints for the app

- If you have **htdemucs.pth** (or equivalent) from the flow-models workflow (e.g. from `demucs/ckpt/` or your own export), **copy it into the main app models dir**:
  - Copy to `models/htdemucs.pth` (and optionally `models/htdemucs.th`), or run `copy-models.sh` from a directory that contains it.
- The **current app uses the pip demucs** with `--repo models/` and expects `htdemucs.th` (or .pth, which it copies to .th). It does not use flow-models’ custom demucs runner or YAML loader.

### B. ONNX Stage 1 (already in app)

- Stage 1 vocal ONNX (e.g. Kim_Vocal_2, UVR-MDX-NET-Voc_FT) is already supported in `stem_service/mdx_onnx.py` and `vocal_stage1.py`. No flow-models code is required.
- Ensure at least one vocal ONNX and the matching `model_data.json` (and referenced YAMLs) are under `models/mdxnet_models/` or `models/MDX_Net_Models/` as in the main docs.

### C. flow-models as a future “premium” or GPU path

- **Flow1dVAE** (MERT, BSRNN-VAE, etc.) could be used later for higher-quality or GPU-only pipelines (e.g. better vocal/instrument separation or post-processing). That would require:
  - Integrating their inference scripts (e.g. `tools/infer_*.py`) behind a feature flag or optional backend.
  - Ensuring checkpoints and deps (e.g. MERT, BSRNN-VAE weights) are available under `models/` or a dedicated dir and not referenced by absolute paths (e.g. no `D:\`).
- **flow-models/demucs** could be used as an alternative Demucs loader (e.g. if you prefer their YAML+.pth layout), but that would be a separate backend from the current pip-demucs + ONNX setup.

### D. Copy script and flow-models

- You can use **flow-models** as one of the **sources** for `copy-models.sh` if you put checkpoints in a known layout there. For example, if you add:
  - `flow-models/demucs/ckpt/htdemucs.pth`
  then extend `copy-models.sh` to copy from `flow-models` into `models/` (e.g. copy `htdemucs.pth` → `models/htdemucs.pth` and then the app or script creates `models/htdemucs.th`).
- Today, `copy-models.sh` is written for a generic “stem-models bank”; adding a branch that also checks `models/flow-models/...` for htdemucs is a small, optional change.

---

## 5. Checklist for “sound quality acceptable” and tests

1. **models/ has htdemucs:** Either `htdemucs.pth` or `htdemucs.th` (or both). The app will create `.th` from `.pth` if needed.
2. **Run E2E tests:** `bash scripts/test-stem-splits.sh` (WSL). This runs 2-stem and 4-stem in quality and speed modes and validates outputs.
3. **Listen:** Check stems under `tmp/stem_split_test/` after a successful run.
4. **Optional:** Add htdemucs from flow-models (or your bank) into `models/` and re-run the tests.

---

## 6. References

- Pip demucs: `demucs/repo.py` (LocalRepo scans only `.th`).
- App: `stem_service/config.py`, `split.py`, `vocal_stage1.py`, `scripts/copy-models.sh`.
- Model policy: [AGENT-models-and-implementation.md](AGENT-models-and-implementation.md).
