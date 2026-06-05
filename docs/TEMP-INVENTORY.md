# TEMP inventory and Tier decisions

Assessment source: TEMP and Stack Assessment plan (2026-06-03). TEMP lives at `d:\burntbeats-aws\TEMP` (gitignored via `temp/`).

## Tier 1 — approved and implemented

| Item | Decision | Implementation |
|------|----------|----------------|
| ONNX-only basic-pitch | Yes | `midi_service/pyproject.toml`, `model_runtime.py`, `pyproject.toml` uv overrides, `uv.lock`, `midi_service/Dockerfile` |
| Speech cleanup TTL | Yes | `backend/routes/speech/cleanup.js`, `docker/cleanup/entrypoint.sh`, `SPEECH_MAX_AGE_HOURS` in compose |
| Compose stem health gate | Yes | `docker-compose.yml` backend `depends_on.stem_service` |
| Repo hygiene | Yes | `stem-splitter-mixer-ui` → `archive/stem-splitter-mixer-ui`; `MultiStemEditor` deprecation note |

## Tier 2 — outcomes

| Item | Decision | Outcome |
|------|----------|---------|
| pitch-tempo-plugin sync | Yes (diff only) | Production copy is canonical: uses `mixerRanges`; TEMP has older hardcoded limits. No file ports required. See `docs/music-app-ux-cherry-pick.md` for UX notes. |
| music-app UX cherry-pick | Yes | Documented in `docs/music-app-ux-cherry-pick.md` (no backend merge) |

## Tier 4 — skip (unchanged)

- TEMP `services/` scrap
- TEMP `audio-shift` vendor demos
- music-app generative AI (AudioCraft, RVC, spectral, beats v8)
- `archive/stem_api` Rust experiment (moved from root `stem_api/`)

## TEMP top-level map

| Path | Role |
|------|------|
| `pitch-tempo-plugin/` | Reference; prod copy under `frontend/.../pitch-tempo-plugin/` |
| `music-app/` | Prior SaaS snapshot — UX reference only |
| `audio-shift/` | Superseded spikes — skip |
| `services/` | Non-runnable monolith scrap — skip |

## Production gaps (tracked, not in Tier 1)

- MIDI → audio preview (soundfont / client synth) — future feature
- MIDI queue scaling — ops tradeoff
- Beat grid marketing QA — `stem_service/scripts/bpm_qa_harness.py`
