# Model inventory & ORT benchmark runbook

Facts over guesses: every ONNX under `models/` is classified, optionally converted to ORT, and timed on a fixed clip so you know what runs in `stem_service` and how fast.

## Environment (Windows vs WSL/Linux)

Use a **venv created on the same OS** you run Python on:

- **WSL Ubuntu:** `cd /mnt/d/burntbeats-aws && source .venv/bin/activate` — there is no `venv\Scripts` on Linux; that is normal.
- **Windows PowerShell:** `.\.venv\Scripts\Activate.ps1`

Mixing a Windows venv with WSL Python (or the reverse) causes real breakage. The ONNX Runtime lines below are **not** that.

### ONNX Runtime “MergeShapeInfo” / `scaled_dot_product_flash_attention` messages

When loading some ONNX files (often transformer-style graphs), ONNX Runtime may print **warnings** about merging shape info and “Falling back to lenient merge.” Those are **not failures** for the inventory script: if the model loads, the row is recorded. The scan script sets `ORT_LOGGING_LEVEL=3` (errors only) by default to hide this noise; set `ORT_LOGGING_LEVEL=2` if you want warnings visible.

## 1. Scan (inventory)

```bash
python scripts/scan_models_inventory.py
```

Produces:

| Output | Purpose |
|--------|---------|
| `tmp/model_inventory.csv` | Machine-readable: path, classification, shapes, ORT present |
| `docs/MODEL-INVENTORY-AUTO.md` | Human-readable table (regenerate; do not hand-edit) |

Vendor trees (e.g. `models/demucs.onnx-main/`) are excluded by default.

**Classifications** (see script for rules):

- `mdx_dim3072` / `mdx_dim2560` — MDX-Net tensor layout; runnable if `stem_service/mdx_onnx.py` `_MDX_CONFIGS` has the filename.
- `demucs_embedded_segment` — waveform length `343980` — legacy Demucs ONNX shape class (inventory only; 4-stem production uses PyTorch Demucs).
- `demucs_waveform_other_seg` — different segment (e.g. `441000`) — **not** supported by current pipeline without code changes.
- `scnet_like`, `vad_like`, `unknown_shape`, etc.

## 2. Batch ORT conversion (build / prep)

```bash
python scripts/convert_all_onnx_to_ort.py --dry-run   # preview
python scripts/convert_all_onnx_to_ort.py             # convert; log in tmp/convert_onnx_to_ort_log.txt
```

Skips when a sibling `.ort` already exists (use `--force` to rebuild).

## 3. Full ONNX vs ORT matrix (timing)

Requires `tmp/model_inventory.csv` from step 1.

```bash
python scripts/benchmark_model_matrix.py --wav "path/to/clip.wav"
# or use benchmark_song.local.txt / BENCHMARK_SONG
```

Writes `tmp/model_matrix_benchmark/summary.json` and `summary.csv` with per-model **ONNX** and **ORT** wall times (30s clip by default, `--clip-seconds`).

**Includes:** all qualified `mdx_dim3072` / `mdx_dim2560` models with config, all `demucs_embedded_segment` models, and one **MDX23C** pair row if both ONNX exist.

**Does not** auto-bench SCNet alternate paths (service uses fixed `SCNET_ONNX`).

## 4. Tier defaults used by API

The API now maps quality lanes to model tiers for Stage 1 ONNX selection:

- `quality=speed` -> tier `fast`
- `quality=balanced` (default) -> tier `balanced`
- `quality=quality` -> tier `quality`
- `quality=ultra` -> ultra pipeline (RoFormer path), with Stage 1 tier treated as `quality`

Current tier candidate order lives in `stem_service/mdx_onnx.py` (`_VOCAL_TIER_NAMES`, `_INST_TIER_NAMES`).

| Tier | Vocal priority (first found wins) | Instrumental priority (first found wins) |
|------|-----------------------------------|-------------------------------------------|
| `fast` | `UVR_MDXNET_3_9662` -> `UVR_MDXNET_KARA` -> `UVR_MDXNET_2_9682` -> `UVR_MDXNET_1_9703` -> `kuielab_b_vocals` | `UVR-MDX-NET-Inst_HQ_5` -> `UVR-MDX-NET-Inst_HQ_4` -> `UVR_MDXNET_KARA_2` -> `Kim_Inst` |
| `balanced` | `Kim_Vocal_1` -> `Kim_Vocal_2` -> `UVR-MDX-NET-Voc_FT` -> `kuielab_b_vocals` -> `kuielab_a_vocals` | `UVR-MDX-NET-Inst_HQ_5` -> `UVR-MDX-NET-Inst_HQ_4` -> `UVR_MDXNET_KARA_2` |
| `quality` | `UVR-MDX-NET-Voc_FT` -> `Kim_Vocal_2` -> `Kim_Vocal_1` -> `mdx23c_vocal` | `UVR-MDX-NET-Inst_HQ_4` -> `UVR-MDX-NET-Inst_HQ_5` -> `UVR_MDXNET_KARA_2` -> `Kim_Inst` |

Notes:

- For 2-stem preview/routing, `quality` tier may prefer **MDX23C pair** (`mdx23c_vocal` + `mdx23c_instrumental`) when both are present.
- ORT siblings are preferred over ONNX at runtime when both exist (unless explicitly forced for benchmarking).

## 5. Adding an “untapped” ONNX

1. Drop the file under `models/` (not inside excluded vendor dirs).
2. Re-run **scan**. If classification is MDX-like but **benchmark skips**, add a line to `_MDX_CONFIGS` in `stem_service/mdx_onnx.py` (copy from Kim/Inst_HQ if shapes match).
3. Re-run **convert** (optional) and **benchmark_matrix**.

## 6. Related docs

- [ORT-MODEL-CONVERSION.md](ORT-MODEL-CONVERSION.md) — ORT vs ONNX at runtime  
- [MODELS-INVENTORY.md](MODELS-INVENTORY.md) — historical deep audit (manual)  
- [MODEL-INVENTORY-AUTO.md](MODEL-INVENTORY-AUTO.md) — **generated** index (current tree)  
