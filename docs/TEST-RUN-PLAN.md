# Test run plan — Two-pass split + expand (2-stem then 4-stem)

**Track:** ~4 min  
**Date:** 2026-03-13

## Stack

- **Start (WSL, repo root):** `bash scripts/run-all-local.sh`
- **Frontend:** http://localhost:5173  
- **Backend:** http://localhost:3001 | **Stem:** http://localhost:5000

## Runs (in order)

| # | Mode | Stem count | What’s exercised | Note |
|---|------|------------|-------------------|------|
| 1 | **Speed** | 2->4 | Split 2 stems (vocals + instrumental) with speed mode → expand to 4 stems (Demucs htdemucs, shifts=0) | Time _____ | First pass complete; vocals clean? instrumental ok? _____ |
| 2 | **Quality** | 2->4 | Split 2 stems with quality mode → expand to 4 stems (Demucs bag mdx_extra_q) | Time _____ | Same track; compare separation vs Speed _____ |

Optional: same track with `DEMUCS_QUALITY_BAG=mdx_extra` (heavy bag) for Quality 4-stem to compare time/quality vs mdx_extra_q.

## Quick checklist

- [ ] Upload ~4 min track in UI
- [ ] Run 1: Quality = **Speed** → split first (2 stems) → expand to 4 stems → note time + first listen
- [ ] Run 2: Quality = **Quality** → split first (2 stems) → expand to 4 stems → note time + compare to Speed

## Stop stack

Ctrl+C in the terminal where `run-all-local.sh` is running, or from another terminal (repo root):

```bash
fuser -k 5000/tcp 3001/tcp 5173/tcp 2>/dev/null || true
```
