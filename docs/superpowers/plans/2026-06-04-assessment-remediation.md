# Assessment Remediation Implementation Plan

> **Status:** Implemented 2026-06-04

**Goal:** Close confirmed gaps from the external codebase assessment: speech_service CI/tests, full backend tests in CI, frontend quality gates, ops/hygiene docs.

**Architecture:** Add pytest + CI jobs for speech; replace backend CI file list with `npm test`; enforce orchestration line limits in frontend CI; document deploy/Redis; archive `stem_api`.

**Tech Stack:** pytest, GitHub Actions, Vitest, Node `node --test`

---

## Completed tasks

### Task 1: speech_service spec and tests

- Spec: [`docs/superpowers/specs/2026-06-04-speech-service-ci-design.md`](../specs/2026-06-04-speech-service-ci-design.md)
- Tests: `speech_service/tests/` (config, internal_auth, job_queue)
- CI: `speech-python`, `speech-docker` jobs

### Task 2: Backend full test suite in CI

- `.github/workflows/ci.yml` backend job runs `npm test` with test env vars

### Task 3: Frontend gates

- Full Vitest already in CI; added `test:assertions` and `quality:baseline` with `QUALITY_BASELINE_ENFORCE=1`
- Limits: `App.tsx` ≤ 20 lines, `useEditorSession.ts` ≤ 850 lines

### Task 4: Hygiene

- `stem_api/` → `archive/stem_api/`
- [`docs/DEPLOY.md`](../../DEPLOY.md) — build cache vs `--no-cache`, Redis
- README + satellite READMEs updated

## Verification commands

```bash
uv sync --frozen --all-packages --group dev
INTERNAL_SERVICE_AUTH_REQUIRED=0 uv run pytest speech_service/tests -q

cd backend && npm test

cd frontend && npm run test:run
QUALITY_BASELINE_ENFORCE=1 npm run quality:baseline
```
