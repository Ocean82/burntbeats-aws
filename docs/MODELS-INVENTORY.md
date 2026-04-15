# Deep inventory: models/ and stem-models. (very much should be updated frequently)

**Date:** 2026-03-09 (reviewed 2026-03-17)  update update update update update. 
**Purpose:** Full recursive audit of `/path/to/burntbeats-aws/models` and copy source `/path/to/stem-models` (all subdirectories). So no models are missed.

**Automated (facts on *this* tree):** Run `python scripts/scan_models_inventory.py` → `tmp/model_inventory.csv` + `docs/MODEL-INVENTORY-AUTO.md`. Full workflow (ORT conversion + 30s matrix): [MODEL-INVENTORY-RUNBOOK.md](MODEL-INVENTORY-RUNBOOK.md).

---

## 1. Project models dir: `/path/to/burntbeats-aws/models`

Recursive scan: **6 directories**, **54 files** (including configs). No flow-models here — flow-models lives under stem-models or was audited separately.

### 1.1 Directory tree. has not been updated. 4/12/2026

```
models/
├── .gitkeep
├── htdemucs.pth          # Demucs (app creates .th from this)
├── silero_vad.jit        # VAD pre-trim
├── UVR-MDX-NET-Inst_HQ_5.onnx
├── mdxnet_models/
│   ├── model_data.json
│   ├── Kim_Vocal_2.onnx
│   ├── Reverb_HQ_By_FoxJoy.onnx
│   ├── UVR-MDX-NET-Inst_HQ_4.onnx
│   ├── UVR-MDX-NET-Voc_FT.onnx
│   └── UVR_MDXNET_KARA_2.onnx
└── MDX_Net_Models/
    ├── model_bs_roformer_ep_317_sdr_12.9755.ckpt
    ├── model_bs_roformer_ep_368_sdr_12.9628.ckpt
    ├── UVR-MDX-NET-Inst_HQ_5.onnx
    ├── UVR_MDXNET_1_9703.onnx
    ├── UVR_MDXNET_2_9682.onnx
    ├── UVR_MDXNET_3_9662.onnx
    ├── UVR_MDXNET_KARA.onnx
    └── model_data/
        ├── model_data.json
        ├── model_name_mapper.json
        └── mdx_c_configs/   # 30+ YAML configs
```

### 1.2 Model files in project (by type)

| Type   | Paths |
|--------|--------|
| **.pth** | `models/htdemucs.pth` |
| **.jit** | `models/silero_vad.jit` |
| **.onnx** | `models/UVR-MDX-NET-Inst_HQ_5.onnx`, `models/mdxnet_models/*.onnx` (5), `models/MDX_Net_Models/*.onnx` (5) |
| **.ckpt** | `models/MDX_Net_Models/model_bs_roformer_ep_317_sdr_12.9755.ckpt`, `model_bs_roformer_ep_368_sdr_12.9628.ckpt` |

All are present and wired for the app (htdemucs → .th; ONNX vocal paths in mdx_onnx; MDX_Net_Models for model_data).

---

## 2. Copy source: `/path/to/stem-models`

Recursive scan: **51 directories**, all model/config file types below. WSL path: `/mnt/d/DAW Collection/stem-models`.

### 2.1 Directory tree (full depth)

```
stem-models/
├── htdemucs.pth
├── Kim_Vocal_2.onnx
├── UVR-MDX-NET-Inst_HQ_5.onnx
├── silero_vad.jit
├── all-uvr-models/
│   ├── Kim_Vocal_2.onnx
│   ├── MDX23C-8KFFT-InstVoc_HQ.ckpt
│   ├── MDX23C_D1581.ckpt
│   ├── model_bs_roformer_ep_317_sdr_12.9755.ckpt
│   ├── model_bs_roformer_ep_937_sdr_10.5309.ckpt
│   ├── UVR-MDX-NET-Inst_HQ_4.onnx
│   ├── UVR-MDX-NET-Inst_HQ_5.onnx
│   ├── mdxnet_models-onnx/
│   │   ├── model_data.json
│   │   ├── Kim_Vocal_2.onnx
│   │   ├── Reverb_HQ_By_FoxJoy.onnx
│   │   ├── UVR-MDX-NET-Voc_FT.onnx
│   │   └── UVR_MDXNET_KARA_2.onnx
│   └── MDX_Net_Models-onnx/
│       ├── UVR_MDXNET_*.onnx (4 files)
│       └── MDX_Net_Models/ (same ONNX again)
├── MDX_Net_Models/
│   ├── model_data/
│   │   ├── model_data.json
│   │   ├── model_name_mapper.json
│   │   └── mdx_c_configs/   # 30+ YAMLs
│   ├── model_bs_roformer_ep_317_sdr_12.9755.ckpt
│   ├── model_bs_roformer_ep_368_sdr_12.9628.ckpt
│   └── UVR*.onnx (5)
├── MDX_Net_Models-onnx/
│   └── UVR_MDXNET_*.onnx (4)
├── flow-models/
│   ├── htdemucs.pth
│   ├── demucs/ckpt/
│   │   ├── EMBER-DEMUCS-SEPARATOR-ALT.pth
│   │   └── htdemucs.yaml
│   ├── flow-ckpt/
│   │   ├── EMBER-DEMUCS-SEPARATOR-ALT.pth
│   │   └── htdemucs.yaml
│   ├── vae/
│   │   ├── autoencoder_music_1320k.ckpt
│   │   └── stable_audio_1920_vae.json
│   ├── autoencoders/   # VAE JSON configs
│   ├── config/
│   ├── dac/
│   └── Flow1dVAE/      # deep: configs, libs, models_gpt, our_MERT_BESTRQ, tools
└── v5_July_2021_5_Models/
    └── models/
        ├── HP2-4BAND-3090_4band_1.pth
        ├── HP2-4BAND-3090_4band_2.pth
        ├── HP_4BAND_3090.pth
        ├── Vocal_HP_4BAND_3090.pth
        └── Vocal_HP_4BAND_3090_AGG.pth
```

### 2.2 Copy mapping (what copy-models.sh uses today)

| Destination in project | Source under stem-models |
|------------------------|--------------------------|
| `models/htdemucs.pth` + `.th` | `stem-models/htdemucs.pth` (or `stem-models/flow-models/htdemucs.pth` if root missing) |
| `models/MDX_Net_Models/` | `stem-models/MDX_Net_Models/` (full tree) |
| `models/mdxnet_models/` | `stem-models/all-uvr-models/mdxnet_models-onnx/` |
| `models/silero_vad.jit` | `stem-models/silero_vad.jit` |

### 2.3 Additional items in stem-models (not copied by script yet)
-verify and update with date

| Location | Files | Note |
|----------|--------|------|
| **stem-models/** (root) | Kim_Vocal_2.onnx, UVR-MDX-NET-Inst_HQ_5.onnx | Optional: copy to `models/` root for ONNX fallback. |
| **all-uvr-models/** | MDX23C-8KFFT-InstVoc_HQ.ckpt, MDX23C_D1581.ckpt, model_bs_roformer_ep_937_sdr_10.5309.ckpt | GPU/other backends; not used by current CPU pipeline. |
| **all-uvr-models/** | UVR-MDX-NET-Inst_HQ_4.onnx, UVR-MDX-NET-Inst_HQ_5.onnx | Duplicates of mdxnet_models-onnx / MDX_Net_Models. |
| **MDX_Net_Models-onnx/** | UVR_MDXNET_*.onnx (4) | Flat ONNX; project already has these under MDX_Net_Models. |
| **flow-models/** | htdemucs.pth, EMBER-DEMUCS-SEPARATOR-ALT.pth, vae/autoencoder_music_1320k.ckpt | htdemucs used if root missing; rest for flow-models pipeline. |
| **v5_July_2021_5_Models/models/** | HP2-4BAND-*.pth, Vocal_HP_4BAND_*.pth | Different pipeline (4-band/Vocal HP); optional future. |

---

## 3. How to sync from stem-models (WSL)
verify and update...

From repo root:

```bash
STEM_MODELS_SOURCE="/mnt/d/DAW Collection/stem-models" bash scripts/copy-models.sh
```

Or:

```bash
bash scripts/copy-models.sh "/mnt/d/DAW Collection/stem-models"
```

This copies htdemucs (→ .pth + .th), full MDX_Net_Models tree, mdxnet_models from all-uvr-models/mdxnet_models-onnx, and silero_vad.jit. Optional root ONNX and v5/flow-models extras can be added to the script if you want them under `models/`.

---

## 4. Summary
needs to be updated. 
- **Project `models/`:** Fully listed; depth is shallow (mdxnet_models, MDX_Net_Models/model_data/mdx_c_configs). No models missed in this tree.
- **stem-models:** Full recursive scan; 51 dirs; all .pth/.th/.ckpt/.onnx/.jit and key .yaml/.json listed. Copy script uses the main sources; doc above lists every additional model location for optional copying or future pipelines.
