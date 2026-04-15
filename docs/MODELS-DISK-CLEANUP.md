# Models folder cleanup (local disk)

The **`models/`** tree is **gitignored**; this doc describes safe local maintenance.

## Retired Demucs ONNX

Production 4-stem uses **PyTorch** `htdemucs.pth` / `htdemucs.th`, not embedded Demucs ONNX. If you still have any of these under `models/`, they are safe to delete after you confirm backups:

- `demucsv4.onnx`, `htdemucs.onnx`, `htdemucs_6s.onnx`, `htdemucs_embedded.onnx`

## Dedupe `mdxnet_models` / `MDX_Net_Models` vs root

`stem_service` searches **`models/<file>.onnx`** before subfolders. If the same filename exists in **`mdxnet_models/`** or **`MDX_Net_Models/`** with **identical** content, you only need one copy (typically at **`models/`** root).

Re-check safely anytime:

```bash
python scripts/dedupe_models_onnx.py          # dry-run
python scripts/dedupe_models_onnx.py --apply  # delete matching duplicates
```

**ORT siblings:** the script only removes files whose **root copy** has the **same SHA-256**. If `.ort` files differ between root and a subfolder, they are skipped — do not delete those by hand without comparing hashes.

## Regenerate inventory

After large changes, refresh **`models/INVENTORY.md`** (if you track it locally):

```bash
python scripts/build_models_inventory.py
```
