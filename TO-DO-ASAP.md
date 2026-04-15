# TO-DO-ASAP

This list is now closed. Items below are recorded as completed.

## Completed

- Audit requirements/dependency files across backend, frontend, stem_service, and compose/runtime wiring.
- Verify server containers load expected dependency versions from lock/requirements files.
- Collect 4-stem failure evidence from server job logs/progress and container logs.
- Identify root cause(s) and apply targeted fix for 4-stem failures.
- Update local model rank/path references and runtime policy.
- Switch runtime model root to `server_models` where required.
- Verify local runtime resolves expected model files and paths.
- Perform server migration and runtime verification.
- Correct CI Docker image tag mismatch in backend deps job.
- Upgrade Vite to patched version and verify audit/build pass.
- Lock speed 4-stem policy to rank 28 only (no speed fallback).
- Update documentation to match final runtime behavior.

## Current Policy Snapshot

- 4-stem speed: rank 28 only (`cfa93e08-61801ae1.th`)  
- 4-stem speed fallback: disabled  
- 4-stem quality: rank 1 -> rank 2 fallback  
- Runtime model root: `server_models` when `STEM_MODELS_DIR=server_models`
