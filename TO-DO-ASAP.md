# TO-DO-ASAP

This is the current actionable list, including unfinished items carried forward from the previous todo list.

## In Progress

- Update local model rank/path references from speed rank `27/28` to `28/29` (model filenames unchanged by user intent).

## Pending (Carried Forward + New)

- Re-test full 4-stem end-to-end API flow (`split -> status -> fetch`) with auth enabled and report remaining risks.
- Validate local runtime resolves expected files for:
  - 2-stem speed
  - 2-stem quality
  - 4-stem speed (rank 28 primary, rank 29 fallback mapping)
  - 4-stem quality (rank 1 primary, rank 2 fallback mapping)
- Confirm whether local active runtime should continue using `models/` or be switched to `server_models/`.
- If switching to `server_models/`:
  - set `STEM_MODELS_DIR=server_models` in local runtime config,
  - verify required ONNX/ORT + Demucs files exist under `server_models`,
  - run local smoke tests again.
- Keep server deployment unchanged until local path/model verification is complete.
- Prepare server rollout plan after local verification:
  - copy/sync validated model tree,
  - update server runtime model root only if needed,
  - rebuild/restart services,
  - run production-safe smoke test.
- Update docs after local verification so model rank references and expected folder layout are consistent.

## Completed (From Previous List)

- Audit requirements/dependency files across backend, frontend, stem_service, and compose/runtime wiring.
- Verify server containers load expected dependency versions from lock/requirements files.
- Collect 4-stem failure evidence from server job logs/progress and container logs.
- Identify root cause(s) and apply targeted fix for 4-stem failures.
