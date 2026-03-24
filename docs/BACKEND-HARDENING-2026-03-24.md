# Backend Hardening Notes (2026-03-24)

This note summarizes backend and stem-service hardening completed on 2026-03-24.

## What changed

- Fixed a stem-service runtime failure risk in `stem_service/server.py`:
  - `model_tier` is now initialized before first use in `_run_separation_sync`.
  - `started_at` now records runtime (`time.time()`) instead of file mtime.
- Fixed backend-to-stem-service auth alignment:
  - `backend/server.js` now forwards `X-Stem-Service-Token` when `STEM_SERVICE_API_TOKEN` is configured.
  - Forwarding is applied to split, expand, and cancel proxy calls.
- Migrated destructive cleanup endpoint to a safe HTTP method:
  - Supported route is now `POST /api/stems/cleanup`.
  - `GET /api/stems/cleanup` now returns `405` with migration guidance.
- Simplified backend proxy implementation for clarity:
  - Extracted shared helpers for upstream form proxying and error mapping.
  - Reduced duplicate nested request/response handling in split/expand handlers.

## Test coverage added

- New backend tests verify token forwarding for:
  - `POST /api/stems/split`
  - `POST /api/stems/expand`
  - `DELETE /api/stems/:job_id`
- Added stem-service regression test to prevent reintroducing the uninitialized `model_tier` bug.
- Updated cleanup route tests for `POST` support and `GET` rejection behavior.

## Operational impact

- If any automation still calls `GET /api/stems/cleanup`, update it to `POST`.
- If `STEM_SERVICE_API_TOKEN` is enabled on stem service, backend now correctly propagates the header, preventing 401 mismatches.
