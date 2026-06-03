# Two-PR ship: Tier 1 ops/MIDI + frontend/audio

**Date:** 2026-06-03  
**Status:** Approved  
**Decision:** Shipping strategy C — sequential two PRs; MIDI strategy = current ONNX-only path (uv overrides + forced ONNX, keep `basic-pitch`).

## Problem

Tier 1 work from the TEMP/stack assessment is implemented locally but uncommitted, mixed with unrelated frontend/audio changes. `main` still resolves TensorFlow via `basic-pitch` on Linux until PR1 lands. Dependabot alerts #51–#56 remain open.

## Goals

1. Merge Tier 1 (ONNX MIDI, speech cleanup, compose stem gate, archive orphan UI, assessment docs) without unrelated frontend churn.
2. Confirm Dependabot closure on default branch after PR1.
3. Ship remaining frontend/audio work in a second PR from updated `main`.
4. Defer Option A (drop `basic-pitch` / own ONNX wrapper) and Python 3.10 stopgap.

## Non-goals

- Internal `basic-pitch` fork
- TEMP `services/` or music-app backend merge
- Committing `.vscode/`, `pyproject.toml.test`, or `frontend/src/daw/docs/` unless explicitly added to PR2

## Architecture

### MIDI inference (PR1)

- **Dependency resolution:** Root `[tool.uv] override-dependencies` blocks TensorFlow/Keras from the lock graph.
- **Runtime:** `midi_service/services/model_runtime.py` uses `build_icassp_2022_model_path(FilenameSuffix.onnx)`.
- **Conversion:** `conversion.py` continues to call `basic_pitch.inference.predict` with explicit ONNX model path.
- **Container:** `midi_service/Dockerfile` runs `uv sync` then uninstalls stray TF wheels.

### Ops (PR1)

- **Speech TTL:** `POST /api/speech/cleanup` mirrors stems/MIDI; sidecar calls it with `SPEECH_MAX_AGE_HOURS`.
- **Startup:** Backend `depends_on` includes `stem_service` with `service_healthy`.

### PR sequencing

```text
main ──► branch tier1/onnx-midi-ops ──► PR1 merge ──► main
                                              │
                                              └──► branch frontend/audio ──► PR2 merge
```

Approach: **sequential merge** (not stacked PR2-on-PR1 long-term).

## PR1 scope

### Include

| Area | Paths |
|------|--------|
| MIDI ONNX | `pyproject.toml`, `uv.lock`, `midi_service/pyproject.toml`, `midi_service/requirements.txt`, `midi_service/Dockerfile`, `midi_service/services/model_runtime.py`, `midi_service/tests/test_model_runtime.py` |
| Speech cleanup | `backend/routes/speech/cleanup.js`, `shared.js`, `index.js`, `backend/server.test.js`, `backend/middleware/rateLimiter.js` |
| Compose | `docker-compose.yml` |
| Cleanup sidecar | `docker/cleanup/entrypoint.sh` |
| Hygiene | `archive/stem-splitter-mixer-ui/`, removal of root `stem-splitter-mixer-ui/`, `frontend/src/components/MultiStemEditor.tsx` (deprecation comment only) |
| Docs | `docs/TEMP-INVENTORY.md`, `docs/DEPENDABOT-MIDI-ONNX.md`, `docs/music-app-ux-cherry-pick.md`, this spec, implementation plan under `docs/superpowers/plans/` |
| Gitignore | `docs/**` exceptions including `docs/superpowers/**` |

### Exclude

- `frontend/src/contexts/AudioContext.tsx`, `hooks/audio/*`, `utils/tempoSync*`, `VocalCleanupQuickApply.tsx`, `vocalCleanupPreset*`, `DjModeEditor.tsx`, `MixerPresetsModal.tsx`, `utils/audio.ts`, etc.
- `.vscode/`, `Speech/.vscode/`, `pyproject.toml.test`, `frontend/src/daw/docs/`

### PR1 verification

| Check | Command / action |
|-------|------------------|
| Lock | `uv lock`; confirm no installed TF/Keras for midi package |
| MIDI tests | `uv run --package burntbeats-midi pytest midi_service/tests -q` |
| Backend tests | `cd backend && npm test` |
| Docker | `docker build -f midi_service/Dockerfile .` |
| Post-merge | GitHub Dependabot #51–#56 state on default branch |

## PR2 scope

- All intentional frontend/audio changes left unstaged after PR1.
- Branch from `main` after PR1 merge.
- Verification: frontend lint/tests per project norms; no `uv.lock` / midi_service changes.

## Error handling and operational notes

- Speech/stem/MIDI cleanup returns 503 if `API_KEY` unset (existing pattern).
- Backend cold start waits for stem service; document in PR description if operators notice slower compose boot.
- `protobuf` may remain via `onnxruntime`; alert #55 may need separate follow-up if still open after PR1.

## Risks

| Risk | Mitigation |
|------|------------|
| uv overrides break on future `basic-pitch` release | Pin `basic-pitch>=0.4.0,<0.5`; document in DEPENDABOT doc |
| Accidental frontend files in PR1 | Explicit `git add` paths; PR checklist |
| Dependabot slow to close | Re-scan 24h after merge; link PR to alerts |

## Success criteria

- PR1 merged with passing CI and verification commands above.
- Dependabot #51–#56 closed or documented residual (#55 protobuf).
- PR2 merged without MIDI/lockfile changes.
- README “ONNX CPU” claim aligned with production midi image.
