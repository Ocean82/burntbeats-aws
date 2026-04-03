# ONNX → ORT conversion (build-time, optional)

## What `models/demucs.onnx-main` was (optional vendor tree)

If present, the **[demucs.onnx](https://github.com/sevagh/demucs.onnx)** upstream sample under `models/demucs.onnx-main/` is **reference code** for exporting Demucs-style graphs and converting to **ORT**. It is **excluded** from inventory scans by default.

**Production 4-stem** does **not** use in-process Demucs ONNX — use **PyTorch** `htdemucs.pth` / `htdemucs.th`. MDX / SCNet ONNX still use the ORT preference below.

## What *does* apply to our models

The README’s **ONNX → ORT** step uses the **standard ONNX Runtime** tool:

```bash
python -m onnxruntime.tools.convert_onnx_models_to_ort <path_or_dir> --enable_type_reduction
```

(Upstream wraps this in `scripts/convert-model-to-ort.sh`.)

- **When:** CI / image build / release prep — **before** deploy.
- **Why:** ORT files often **load faster** and can be **smaller** than raw ONNX; `--enable_type_reduction` narrows tensor types where safe.
- **Runtime:** ONNX Runtime’s Python API loads `.ort` the same way as `.onnx` (`InferenceSession`).

## How this repo uses `.ort` (MDX / SCNet / etc.)

`stem_service/mdx_onnx.py` **`resolve_mdx_model_path()`** prefers a sibling **`models/<name>.ort`** over **`models/<name>.onnx`** when both exist (unless `BURNTBEATS_DISALLOW_ORT=1`). Add ORT artifacts at build time for MDX models without changing tier names in code.

## Required validation (do not skip)

After conversion:

1. **Smoke:** load session (service start or `scripts/probe_onnx.py` against the `.ort` path).
2. **Separation:** run a **long enough** musical clip (e.g. ≥15–30 s) and compare stems to the `.onnx` baseline (level + sanity listening).
3. **Edge cases:** `--enable_type_reduction` is powerful; if anything breaks, retry without it or narrow scope.

## Example (single file)

From repo root, with venv active:

```bash
python -m onnxruntime.tools.convert_onnx_models_to_ort models/Kim_Vocal_2.onnx --enable_type_reduction
# produces models/Kim_Vocal_2.ort next to the onnx
```

Keep or remove the `.onnx` as you prefer; MDX resolution prefers `.ort` when both exist.

## A/B benchmark (ONNX vs ORT on the same 30s clip)

Script: `scripts/benchmark_onnx_vs_ort.py`

- Converts (unless `--skip-convert`): `Kim_Vocal_2.onnx`, `mdx23c_vocal.onnx`, `mdx23c_instrumental.onnx` when present (Demucs ONNX benchmarking was removed).
- Trims input to `--clip-seconds` (default 30) and runs each case twice (ONNX then ORT), clearing session caches between runs.
- Writes `tmp/onnx_vs_ort_benchmark/summary.json` and `summary.csv`.

```bash
python scripts/benchmark_onnx_vs_ort.py --wav "C:/path/to/song.wav"
# or rely on benchmark_song.local.txt / BENCHMARK_SONG
python scripts/benchmark_onnx_vs_ort.py --skip-convert
```

## Related

- [benchmark-demucs-onnx.md](benchmark-demucs-onnx.md) — benchmark folders vs production paths  
- [CPU-OPTIMIZATION-TIPS.md](CPU-OPTIMIZATION-TIPS.md) — threading / env  
