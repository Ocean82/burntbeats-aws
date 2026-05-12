
##5/11/2026

## Project Assessment: Burnt Beats

**What it is:** A full-stack audio stem-splitting SaaS — users upload songs, AI separates them into stems (vocals, drums, bass, etc.), and a browser-based mixer lets them remix, edit, and export. Monetized via Stripe subscriptions with token-based metering.

**Overall health: 6/10** — Feature-complete and well-architected at the macro level, but accumulating technical debt in code organization, configuration, and test coverage.

---

## Critical Issues (Fix Now)

### 1. Environment Configuration Bugs (Production Impact)

Your `docs/plans/env-cleanup.md` already documents these, but they appear unfixed:

- **`PUBLIC_BASE_URL`** in root `.env` points to `accounts.burntbeats.com/sign-in` (a Clerk URL) instead of `https://burntbeats.com`. Docker production builds generate broken stem file URLs.
- **Pricing table ID mismatch** — root `.env` has a stale `VITE_STRIPE_PRICING_TABLE_ID`; frontend `.env` has the current one. Docker builds get the wrong table.
- **`STRIPE_PRICE_ID_SINGLE`** is now in `docker-compose.yml` (good), but verify it's actually reaching the container.

### ~~2. No CI/CD Pipeline~~ — RESOLVED

GitHub Actions CI runs on every PR and push to main: frontend ESLint + typecheck + build + unit tests + Playwright e2e, backend lint + audit + health smoke, Python syntax + ruff + pytest, Docker image builds for both backend and stem_service.

### 3. Low Test Coverage (~10%)

| Layer | Test Files | Estimated Coverage |
|-------|-----------|-------------------|
| Frontend | ~10 | 15% |
| Backend | 3 | 5% |
| Stem Service | 6 (many skipped) | 10% |

Missing: integration tests for billing flows, stem split/expand pipelines, webhook handling. Refactoring the large files without tests is risky.

---

## Structural Debt (Short-Term)

### Large Monolithic Files

Your decomposition plan identifies these correctly:

| File | Lines | Problem |
|------|------:|---------|
| `ProcessingSettingsPanel.tsx` | 925 | UI + logic + state tangled |
| `useAudioPlayback.ts` | 874 | Playback, seek, volume, transport all in one |
| `App.tsx` | 765 | Route logic + state setup + provider tree |
| `mdx_onnx.py` | 701 | Model registry + STFT math + inference |
| `hybrid.py` | 693 | 2-stem + 4-stem + expand pipelines |
| `usageTokens.js` | 595 | Cost calc + balance + operations + Stripe metadata |

The 13-phase decomposition plan in `PROJECT-DECOMPOSITION-MASTER-PLAN.md` is well-structured. Phase 1 (api.ts split) is the right starting point — low risk, pure extraction, establishes the pattern.

### ~~No Frontend ESLint~~ — RESOLVED

ESLint 9 configured with `typescript-eslint`, `eslint-plugin-react-hooks` (v5), and `eslint-plugin-jsx-a11y`. CI enforces zero errors with a 70-warning budget. Remaining warnings are tracked for incremental cleanup.

### No API Documentation

Developers must read `backend/server.js` and route files to understand endpoints. No OpenAPI spec means no generated client SDKs, no contract testing.

---

## Infrastructure Gaps (Medium-Term)

| Gap | Risk | Effort |
|-----|------|--------|
| No CI/CD | Regressions ship undetected | 2-3 days |
| Deploy script ships `.env` files | Can overwrite production secrets | 1 hour |
| No rollback strategy | Bad deploy = manual recovery | 1 day |
| No dependency audit | Vulnerable packages go unnoticed | 2 hours |
| No APM/monitoring | Can't detect slowdowns in production | 1 day |
| Stem service healthcheck uses `python -c` | Slow, fragile, adds latency to orchestration | 30 min |

---

## What's Working Well

- **Architecture** — Clean separation between frontend, backend, and ML service. Async job model with 202/polling is solid.
- **Documentation** — `ARCHITECTURE-FLOW.md` is an excellent product contract. The decomposition plan is detailed and actionable.
- **Auth + Billing** — Clerk + Stripe integration with webhook-driven token grants is well-designed.
- **Modern stack** — React 19, TypeScript 5.9, Tailwind 4, Vite 7, Express 4 with Helmet. Dependencies are current.
- **Docker setup** — Health checks, resource limits, proper volume mounts.

---

## Recommended Priority Order

1. **Fix env bugs** — ✅ COMPLETE (2026-05-11)
2. **Set up CI/CD** — ✅ COMPLETE (GitHub Actions: lint + typecheck + test + security audit + Docker build on PR)
3. **Add ESLint to frontend** — ✅ COMPLETE (2026-05-11: eslint 9 + typescript-eslint + react-hooks + jsx-a11y)
4. **Start decomposition Phase 1** — ✅ COMPLETE (`api.ts` split into `api/` module directory)
5. **Add integration tests** — ⚠️ PARTIAL (backend billing webhook tests exist; frontend integration tests still needed)
6. **Fix deploy script** — ✅ COMPLETE (`.env` excluded from tarball, server-side check added)
7. **Continue decomposition** — ✅ COMPLETE (Phases 2-7 all verified and marked complete)

The project has solid bones and a clear roadmap. The main risk is that the env bugs and lack of CI/CD mean you're shipping blind. Fix those two things and the rest becomes incremental improvement.

---

## Remaining Work

| Item | Status | Next Step |
|------|--------|-----------|
| Frontend integration tests | Not started | Add Playwright tests for billing checkout flow and stem split happy path |
| Tighten ESLint rules | Ongoing | Resolve 65 warnings, then promote `rules-of-hooks` and a11y rules to errors |
| Decomposition Phases 8-13 | Not started | Frontend: useAudioPlayback, ProcessingSettingsPanel, App.tsx, useExport, job_worker/server cleanup, duplication pass |
| APM/monitoring | Not started | Add error tracking (Sentry) and performance monitoring |
| Rollback strategy | Not started | Document blue/green or tagged-image rollback procedure |