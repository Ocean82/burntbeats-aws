# Agent model alignment and implementation

**Last updated:** 2026-03-17  
**Purpose:** Align [AGENT-Knowledge-Block](AGENT-Knowledge-Block.md), [AGENT-decision-knowledge-context](AGENT-decision-knowledge-context.md) with the stem splitter implementation. Ensure models live **only** under the project; no links to external paths.

---

## 1. Policy: no external links

- **Runtime and deployment:** All model paths used by the app must resolve to files **inside** the repo root. No symlinks or reparse points from `models/` to external paths.
- **Agent bank as copy source only:** Your stem-models directory (e.g. in WSL at `/mnt/d/DAW Collection/stem-models`) is an **import source only**. **Copy** files into the repo’s `models/` (use `scripts/copy-models.sh`). Never reference external paths from code or config.
- **WSL only:** All run and copy commands are bash; no Windows or PowerShell. The app does not support running natively on Windows.

---

## 2. Where models are resolved in code

| Component | Root used | Path |
|-----------|-----------|------|
| **stem_service/config.py** | `Path(__file__).resolve().parent.parent` = repo root | `models/`, `models/htdemucs.pth` / `htdemucs.th` |
| **stem_service/split.py** | REPO_ROOT from config | `models/htdemucs.th` (--repo; pip demucs loads only .th) |
| **stem_service/hybrid.py** | REPO_ROOT | Stage 1: Demucs 2-stem; Stage 2: Demucs on instrumental (htdemucs) |
| **stem_api** (Rust, legacy/unused) | `REPO_ROOT` env | Not wired in by current stack; orchestration happens in Node + Python |

No hardcoded `D:\` or `stem-models` in code. All paths are relative to the repo. Optional future: **mdx_onnx** (or vocal ONNX) under `stem_service/` for Stage 1 when Kim_Vocal_2.onnx etc. are present; see [AGENT-GUIDE.MD](AGENT-GUIDE.MD).

---

## 3. Agent capability → implementation mapping

Agent docs describe **capabilities** and a **model registry** (e.g. high_vocal_fullness, instrumental_bleedless). The **current implementation** does not route by those names; it uses fixed pipelines with CPU-suitable models:

| Agent pipeline / capability | Implementation | Models used |
|-----------------------------|----------------|-------------|
| **karaoke_high_quality** (isolate_vocals → instrumental_bleedless) | Hybrid: Stage 1 vocals (Demucs 2-stem) + phase inversion + Stage 2 Demucs on instrumental | htdemucs (Stage 1 and Stage 2). Optional: ONNX vocal when added. |
| **mastering_safe_instrumental** (instrumental_fullness) | Demucs 4-stem on full mix or on Stage 1 instrumental | htdemucs (`models/htdemucs.pth` or pretrained) |
| **stem_expansion** (4-stem) | Demucs only or hybrid Stage 2 | htdemucs |

The agent **model registry** (bs_roformer_2025_07, mel_roformer_fv7, hyperace_v2, karaoke_bs_anvuew) is **decision context** for a future agent layer. Those entries are GPU-heavy or PyTorch-only. The current server uses **ONNX (Stage 1) + Demucs (Stage 2)** to satisfy the same capabilities on **CPU-only** without depending on Roformer/ckpt models.

---

## 4. Models required inside the project (no links)

Minimum set so that `STEM_BACKEND=hybrid` and `STEM_BACKEND=demucs_only` both work:

- **Demucs:** `models/htdemucs.pth` or `models/htdemucs.th` (required for local `--repo`). The pip package only discovers `.th` in the repo; the app copies `.pth` → `.th` if needed. See `scripts/copy-models.sh`.
- **Stage 1 ONNX (at least one vocal model):**  
  One of: `models/mdxnet_models/Kim_Vocal_2.onnx`, `models/mdxnet_models/UVR-MDX-NET-Voc_FT.onnx`, `models/Kim_Vocal_2.onnx`, `models/UVR-MDX-NET-Voc_FT.onnx`, or same names under `models/MDX_Net_Models/`. Only **vocal** ONNX models (e.g. Kim_Vocal_2, Voc_FT) are used for Stage 1; instrumental (Inst_HQ_4/5) are not in `mdx_onnx.VOCAL_MODEL_PATHS`.
- **MDX config (for ONNX):**  
  `models/MDX_Net_Models/model_data/model_data.json` and, when referenced by hash, YAMLs under `models/MDX_Net_Models/model_data/mdx_c_configs/`. Fallback: `models/mdxnet_models/model_data.json`.

All of these must be **real files** under the repo’s `models/`. If you add or refresh from the agent bank, **copy** the files; do not link. See `scripts/copy-models.sh` for copy sources.

---

## 5. Verifying no symlinks

Before deploy or when adding models, confirm nothing in `models/` is a symlink (use copies only):

```bash
find models -type l
```
(Should return nothing.)

---

## 6. Models and stem-count FAQ

### Are other models in `models/` more appropriate for this project?

- **Current choice is appropriate for CPU-only:** Stage 1 ONNX (Kim_Vocal_2, Voc_FT, Inst_HQ_4/5) + Stage 2 Demucs (htdemucs) is the right stack for no-GPU deployment.
- **Other files in `models/`:** Roformer (BS-Roformer-Viperx-1297, model_bs_roformer_ep_937_sdr_10.5309.ckpt), MDX23C ckpts, and silero_vad are either GPU-heavy or need different loaders. They are not wired in; keeping CPU-only means staying with ONNX + Demucs unless product direction changes.
- **CPU-optimal pipeline:** Stage 0 Silero VAD → Stage 1 MDX ONNX vocal (Kim_Vocal_2 or Voc_FT) → Stage 2 optional Inst_HQ_4/5 → Stage 3 optional htdemucs.th. RoFormer and HP2-3090 models are not used on CPU. The Ultra quality tier is disabled on CPU (falls back to Quality); set `USE_ULTRA_ON_CPU=1` to override (slow, not recommended).

### Should any models be added for efficiency or quality?

- **Optional improvements (not required):**
  - **htdemucs_ft:** For 4-stem, a fine-tuned Demucs variant can improve quality when available; would need to be added to the loader and `models/`.
  - **Stage 1 preference:** Allow choosing Stage 1 ONNX by speed vs quality (e.g. env `STEM_VOCAL_PREFER=quality|speed` to prefer Inst_HQ vs Kim_Vocal_2). Not implemented yet.

### Can the project split by user preference (e.g. 2 vs 4 stems)?

- **Yes.** Default flow is **2-stem first** (vocals + instrumental). User can then **Keep going** to expand to 4 stems (drums, bass, other) via the expand API, or use the mixer as-is.
- **API:** `POST /api/stems/split` with `stems` = `"2"` (default). `POST /api/stems/expand` with `job_id` (of a completed 2-stem job) returns a new job that produces 4 stems. Optional `quality` is forwarded to the Python service.
- **UI:** Source panel: **Split a track** (upload → quality → split → optional “Keep going → 4 stems”) or **Load stems (mashup)** (add WAV/MP3 files as mixer tracks). Mixer supports pitch, time stretch, trim, level, pan.

---

## 7. Efficient model set and test sample

- **Single Demucs model:** One official **htdemucs** checkpoint (`models/htdemucs.th`) is enough for both Stage 1 (2-stem vocals) and Stage 2 (4-stem on instrumental). Get it with `python scripts/download_htdemucs_official.py` (recommended) or from a stem-models bank if in the full-package format.
- **Quality vs speed:** Quality mode tries Stage 1 ONNX (vocal) first; if ONNX fails (e.g. input shape/sample-rate), it falls back to Demucs 2-stem. Speed mode uses Demucs-only Stage 1. Both produce high-quality stems; ONNX can be slightly faster when it runs.
- **Test sample:** Run a full 5 s test (2- and 4-stem, quality and speed) with `bash scripts/test-stem-splits.sh` (WSL). Outputs go to `tmp/stem_split_test/`; the test validates presence, duration, and non-silent RMS. Listen to those stems for subjective quality.

---

## 8. Required models – copy sources

Use `scripts/copy-models.sh` with your stem-models path (e.g. in WSL: `/mnt/d/DAW Collection/stem-models`), or use the official htdemucs download:

| Required asset | How to get it |
|----------------|----------------|
| **htdemucs.th** | **Recommended:** `python scripts/download_htdemucs_official.py`. Or copy from stem-models; the file must be the full package format (klass/args/kwargs/state), not state_dict-only. |
| **MDX_Net_Models/** | `stem-models/MDX_Net_Models/` (incl. `model_data/`) via copy-models.sh |
| **mdxnet_models/** | `stem-models/all-uvr-models/mdxnet_models-onnx/` (Kim_Vocal_2.onnx, UVR-MDX-NET-Voc_FT.onnx, model_data.json) via copy-models.sh |

- **htdemucs_ft:** Optional; not in the default copy. Only one htdemucs (official or compatible) is required for the current backend.
