# ONNX → ORT conversion (build-time, optional)

## What `models/demucs.onnx-main` is

The vendored **[demucs.onnx](https://github.com/sevagh/demucs.onnx)** tree under `models/demucs.onnx-main/` is **upstream sample code**: it exports Demucs with STFT moved outside the graph, ships C++/CLI examples, and documents converting ONNX to **ORT format** for smaller/faster loads and (with a custom ORT build) minimal operator sets.

That is **not** the same graph or export path as our shipped `htdemucs_embedded.onnx` / `htdemucs_6s.onnx` (see `stem_service/demucs_onnx.py` probed shapes). You do **not** need to run that whole repo in production.

## What *does* apply to our models

The README’s **ONNX → ORT** step uses the **standard ONNX Runtime** tool:

```bash
python -m onnxruntime.tools.convert_onnx_models_to_ort <path_or_dir> --enable_type_reduction
```

(Upstream wraps this in `scripts/convert-model-to-ort.sh`.)

- **When:** CI / image build / release prep — **before** deploy.
- **Why:** ORT files often **load faster** and can be **smaller** than raw ONNX; `--enable_type_reduction` narrows tensor types where safe.
- **Runtime:** ONNX Runtime’s Python API loads `.ort` the same way as `.onnx` (`InferenceSession`).

## How this repo uses `.ort`

`stem_service/demucs_onnx.py` resolves each canonical `models/<name>.onnx` to:

1. **`models/<name>.ort`** if present (preferred), else  
2. **`models/<name>.onnx`**

So you can add ORT artifacts at build time **without** changing Python call sites.

## Required validation (do not skip)

After conversion:

1. **Smoke:** load session (service start or `scripts/probe_onnx.py` against the `.ort` path).
2. **Separation:** run a **long enough** musical clip (e.g. ≥15–30 s) and compare stems to the `.onnx` baseline (level + sanity listening).
3. **Edge cases:** `--enable_type_reduction` is powerful; if anything breaks, retry without it or narrow scope.

## Example (single file)

From repo root, with venv active:

```bash
python -m onnxruntime.tools.convert_onnx_models_to_ort models/htdemucs_embedded.onnx --enable_type_reduction
# produces models/htdemucs_embedded.ort next to the onnx
```

Keep or remove the `.onnx` as you prefer; if both exist, the service prefers `.ort`.

## A/B benchmark (ONNX vs ORT on the same 30s clip)

Script: `scripts/benchmark_onnx_vs_ort.py`

- Converts (unless `--skip-convert`): `Kim_Vocal_2.onnx`, `mdx23c_vocal.onnx`, `mdx23c_instrumental.onnx`, and your Demucs file (default `htdemucs_embedded.onnx`).
- Trims input to `--clip-seconds` (default 30) and runs each case twice (ONNX then ORT), clearing session caches between runs.
- Writes `tmp/onnx_vs_ort_benchmark/summary.json` and `summary.csv`.

```bash
python scripts/benchmark_onnx_vs_ort.py --wav "C:/path/to/song.wav"
# or rely on benchmark_song.local.txt / BENCHMARK_SONG
python scripts/benchmark_onnx_vs_ort.py --skip-convert --demucs htdemucs2.onnx
```

For Demucs, when both `.onnx` and `.ort` exist, the benchmark sets `BURNTBEATS_DISALLOW_ORT=1` for the ONNX timing run so the resolver does not pick `.ort`.

## Related

- [benchmark-demucs-onnx.md](benchmark-demucs-onnx.md) — benchmark folders vs production paths  
- [CPU-OPTIMIZATION-TIPS.md](CPU-OPTIMIZATION-TIPS.md) — threading / env  
