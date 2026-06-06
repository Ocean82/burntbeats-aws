# EC2 Model Sync — Operator Runbook

**Completed:** 2026-06-06  
**EC2 host:** `ubuntu@52.0.207.242`  
**Runtime env:** `STEM_MODELS_DIR=server_models`

## Canonical deploy order (never invert)

1. Populate workstation `models/` (bank copy + Demucs ranks + `models_by_type/`).
2. `python scripts/export_server_models.py` — must exit 0.
3. Validate `server_models/MANIFEST.json` includes Demucs ranked `.th` files.
4. `STEM_MODELS_DIR=server_models python scripts/check_models.py` — `kuielab_b_ready: True`.
5. Backup EC2 `server_models/`, then sync with delete (see below).
6. `git pull --ff-only origin main` on EC2 + `docker compose build` + `up -d`.
7. Verify `/health` on ports 5000–5002 and `5173/api/health`.

## Pre-rsync gate (all must pass)

- [ ] `export_server_models.py` exit code 0
- [ ] MANIFEST lists `Demucs_Models/speed_4stem_rank28/cfa93e08-61801ae1.th`
- [ ] MANIFEST lists `Demucs_Models/quality_4stem_rank1/04573f0d-f3cf25b2__29d4388e.th`
- [ ] No tier-1 ORT duplicates at `server_models/` root (typed tree only)
- [ ] `check_models.py` shows `active bag (quality): kuielab_b`

## Sync commands

**Backup (EC2):**

```bash
cp -a ~/burntbeats-aws/server_models ~/burntbeats-aws/server_models.bak.$(date +%Y%m%d%H%M%S)
```

**Workstation → EC2 (prefer rsync with `--delete`):**

```bash
rsync -avz --delete \
  -e "ssh -i ~/.ssh/server_saver_key" \
  ./server_models/ \
  ubuntu@52.0.207.242:/home/ubuntu/burntbeats-aws/server_models/
```

**Windows fallback (no rsync):** remove remote `server_models/`, recreate empty dir, `scp -r server_models/.` into it.

## Never ship to production

- Full stem-models bank (`models/` wholesale via rsync)
- Partial export missing Demucs checkpoints
- `rsync` without `--delete` (leaves hybrid root + typed duplicates)

## Rollback

```bash
cd ~/burntbeats-aws
rm -rf server_models
cp -a server_models.bak.TIMESTAMP server_models
sudo docker compose restart stem_service
```

## 2026-06-06 execution notes

- Workstation `models/` lacked Demucs ranks; copied from EC2 `models/Demucs_Models/`.
- Export produced 12-file MANIFEST with typed layout (~606 MB).
- EC2 code updated `c5710ce` → `08bbc1e` (KARA quality + kuielab routing).
- Docker CMD fix: Python services use `.venv/bin/python` (uv workspace).
- MIDI: pin `setuptools>=69,<81` for `pkg_resources` (resampy/basic-pitch).
- Post-sync health: `four_stem_bag=kuielab_b`, quality vocal `UVR_MDXNET_KARA.ort`.
