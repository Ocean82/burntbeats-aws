# Implementation Plan: Remaining Priority Work

**Date:** 2026-05-11
**Scope:** Frontend integration tests (Playwright), ESLint tightening, Decomposition Phases 8–13 verification

---

## Current State Summary

| Item | Status | Detail |
|------|--------|--------|
| Playwright infrastructure | ✅ Ready | Config, CI integration, `@playwright/test@^1.58.2`, Chromium in CI |
| Existing e2e tests | 2 spec files | `app-flow.spec.ts` (upload/UI smoke), `legal-public.spec.ts` (legal pages) |
| ESLint | ✅ Configured | 65 warnings / 0 errors, budget = 70 |
| Decomposition Phases 8–13 | ✅ All COMPLETE | Verified via tsc, vitest, vite build |

---

## Part 1: Frontend Integration Tests (Playwright)

### Goal

Add Playwright tests for the two critical user flows that currently have zero e2e coverage:
1. **Billing/checkout flow** — navigate to pricing, select a plan, verify Stripe redirect initiates
2. **Stem split happy path** — upload file → start split → verify progress UI → verify stems appear

### Constraints

- Tests run in `VITE_LOCAL_DEV_FULL_APP=1` mode (no real Clerk auth, subscription treated as Premium)
- No real Stripe or backend in CI — tests must mock/intercept network calls
- Tests must be deterministic and fast (< 30s each)

### Test Plan

#### File: `frontend/e2e/billing-flow.spec.ts`

| Test | What it verifies |
|------|-----------------|
| Pricing page renders from editor | Click "Pricing" in header → pricing hero visible, plan cards render |
| Plan cards show correct structure | Each plan card has name, price, token count, CTA button |
| Checkout CTA triggers Stripe redirect | Click "Start Basic" → intercept `/api/billing/checkout` → verify redirect URL or loading state |
| Back to editor navigation works | From pricing page, click "Back to editor" → editor view returns |
| Tab toggle switches between subscriptions and credit packs | Click "Credit Packs" tab → credit pack cards visible |

#### File: `frontend/e2e/stem-split-flow.spec.ts`

| Test | What it verifies |
|------|-----------------|
| Upload → split button enabled | Upload WAV → "Split" button becomes enabled with token cost shown |
| Split request fires on click | Click split → intercept `/api/stems/split` → verify request payload (file, model, stems) |
| Progress UI appears during split | Mock SSE/polling response → progress bar/animation visible |
| Stems appear after split completes | Mock completed job response → stem tracks render in mixer |
| Error state shown on split failure | Mock error response → error alert visible with retry option |

### Implementation Steps

```
1. [ ] Create `frontend/e2e/fixtures/` directory with:
       - `minimal-wav.ts` — reusable WAV buffer helper (extract from app-flow.spec.ts)
       - `api-mocks.ts` — route intercept helpers for billing and stem APIs

2. [ ] Write `frontend/e2e/billing-flow.spec.ts`:
       - Use `page.route()` to intercept `/api/billing/checkout` and return mock Stripe URL
       - Navigate to pricing via header button click
       - Assert plan cards, CTAs, tab toggle, back navigation

3. [ ] Write `frontend/e2e/stem-split-flow.spec.ts`:
       - Use `page.route()` to intercept `/api/stems/split` and return mock job ID
       - Use `page.route()` to intercept `/api/stems/jobs/:id/status` with SSE or polling mock
       - Upload file → click split → verify progress → verify stems render

4. [ ] Update CI workflow (if needed) to ensure new tests run in `npm run test:e2e`

5. [ ] Verify all e2e tests pass locally and in CI
```

### Network Mocking Strategy

Since the app runs without a real backend in CI:

```typescript
// Intercept checkout API
await page.route('**/api/billing/checkout', (route) => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ url: 'https://checkout.stripe.com/mock-session' }),
  });
});

// Intercept split API
await page.route('**/api/stems/split', (route) => {
  route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ jobId: 'mock-job-123', jobToken: 'tok_abc' }),
  });
});

// Intercept job status polling
await page.route('**/api/stems/jobs/mock-job-123/status**', (route) => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'done',
      stems: ['vocals.wav', 'instrumental.wav'],
    }),
  });
});
```

### Estimated Effort: 4–6 hours

---

## Part 2: Tighten ESLint Warnings Over Time

### Current Warning Breakdown (65 total)

| Rule | Count | Category |
|------|------:|----------|
| `react-hooks/set-state-in-effect` | 19 | React Hooks v5 strict |
| `react-hooks/refs` | 15 | React Hooks v5 strict |
| `react-hooks/exhaustive-deps` | 6 | React Hooks core |
| `jsx-a11y/label-has-associated-control` | 5 | Accessibility |
| `jsx-a11y/no-static-element-interactions` | 3 | Accessibility |
| `react-hooks/rules-of-hooks` | 3 | React Hooks core |
| `jsx-a11y/click-events-have-key-events` | 2 | Accessibility |
| `react-hooks/immutability` | 2 | React Hooks v5 strict |
| `react-hooks/purity` | 1 | React Hooks v5 strict |
| `@typescript-eslint/no-unused-vars` | 1 | TypeScript |
| `@typescript-eslint/no-explicit-any` | 1 | TypeScript |
| `@typescript-eslint/no-empty-object-type` | 1 | TypeScript |
| `jsx-a11y/no-autofocus` | 1 | Accessibility |
| `jsx-a11y/no-redundant-roles` | 1 | Accessibility |
| Other (unused disable directive, etc.) | 4 | Misc |

### Tightening Strategy (3 Waves)

#### Wave 1 — Quick Wins (target: reduce to ≤ 50 warnings, lower budget to 50)

**Effort:** 2–3 hours

| Action | Warnings Fixed |
|--------|---------------|
| Fix `@typescript-eslint/no-unused-vars` (remove unused import) | 1 |
| Fix `@typescript-eslint/no-explicit-any` (add proper type) | 1 |
| Fix `@typescript-eslint/no-empty-object-type` (use `Record<string, never>`) | 1 |
| Fix `jsx-a11y/no-autofocus` (remove or add exception comment) | 1 |
| Fix `jsx-a11y/no-redundant-roles` (remove redundant role) | 1 |
| Fix `jsx-a11y/label-has-associated-control` (add htmlFor or wrap) | 5 |
| Fix unused eslint-disable directive | 1 |
| Fix `react-hooks/exhaustive-deps` (add missing deps or suppress) | ~4 |
| **Subtotal** | ~15 |

After Wave 1:
- Lower `--max-warnings` from 70 → 50
- Promote to **error**: `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`

#### Wave 2 — Accessibility Hardening (target: reduce to ≤ 35 warnings, lower budget to 35)

**Effort:** 3–4 hours

| Action | Warnings Fixed |
|--------|---------------|
| Fix `jsx-a11y/click-events-have-key-events` + `no-static-element-interactions` (add keyboard handlers or use `<button>`) | 5 |
| Fix remaining `react-hooks/exhaustive-deps` | 2 |
| Fix `react-hooks/rules-of-hooks` (restructure conditional hook calls) | 3 |
| **Subtotal** | ~10 |

After Wave 2:
- Lower `--max-warnings` from 50 → 35
- Promote to **error**: all `jsx-a11y/*` rules, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`

#### Wave 3 — React Hooks v5 Strict Rules (target: reduce to ≤ 10 warnings, lower budget to 10)

**Effort:** 6–8 hours (these require careful refactoring)

| Action | Warnings Fixed |
|--------|---------------|
| Fix `react-hooks/set-state-in-effect` (move setState out of effects or restructure) | 19 |
| Fix `react-hooks/refs` (restructure ref access patterns) | 15 |
| Fix `react-hooks/immutability` | 2 |
| Fix `react-hooks/purity` | 1 |
| **Subtotal** | ~37 |

After Wave 3:
- Lower `--max-warnings` from 35 → 0
- Promote ALL remaining warn rules to **error**
- Remove `--max-warnings` flag entirely (zero tolerance)

### ESLint Config Changes Per Wave

```javascript
// Wave 1: promote TypeScript rules
"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
"@typescript-eslint/no-explicit-any": "error",

// Wave 2: promote a11y and core hooks
"jsx-a11y/click-events-have-key-events": "error",
"jsx-a11y/no-static-element-interactions": "error",
"jsx-a11y/label-has-associated-control": "error",
"react-hooks/rules-of-hooks": "error",
"react-hooks/exhaustive-deps": "error",

// Wave 3: promote strict hooks
"react-hooks/set-state-in-effect": "error",
"react-hooks/refs": "error",
"react-hooks/immutability": "error",
"react-hooks/purity": "error",
```

### Estimated Total Effort: 11–15 hours across 3 waves

---

## Part 3: Decomposition Phases 8–13 Status

All phases are **verified complete** per the master plan. No implementation work remains.

| Phase | Description | Status | Evidence |
|-------|-------------|--------|----------|
| 8 | `useAudioPlayback.ts` → `hooks/audio/` | ✅ COMPLETE | tsc clean, 96 tests pass, build OK |
| 9 | `ProcessingSettingsPanel.tsx` → `processing-settings/` | ✅ COMPLETE | tsc clean, 102 tests pass, build OK |
| 10 | `App.tsx` state consolidation | ✅ COMPLETE | tsc clean, 102 tests pass, `useAppSubscription` extracted |
| 11 | `useExport.ts` → `hooks/export/` | ✅ COMPLETE | tsc clean, 102 tests pass, build OK |
| 12 | `job_worker.py` + `server.py` cleanup | ✅ COMPLETE | ruff clean, 8 tests pass, shared utility extracted |
| 13 | Duplication consolidation pass | ✅ COMPLETE | No meaningful duplication remaining |

### Post-Decomposition Recommendations

Now that all 13 phases are complete, the codebase is well-structured for:
1. Adding unit tests to individual extracted modules (each is small and focused)
2. Documenting module boundaries (each `index.ts`/`__init__.py` barrel is the public API)
3. Enforcing module boundaries via ESLint import rules (e.g., `eslint-plugin-import` with `no-restricted-imports`)

---

## Execution Priority & Timeline

| Priority | Work Item | Effort | Dependencies |
|----------|-----------|--------|--------------|
| 1 | Playwright billing flow tests | 2–3 hours | None |
| 2 | Playwright stem split flow tests | 2–3 hours | None (parallel with #1) |
| 3 | ESLint Wave 1 (quick wins) | 2–3 hours | None |
| 4 | ESLint Wave 2 (a11y hardening) | 3–4 hours | After Wave 1 |
| 5 | ESLint Wave 3 (hooks strict) | 6–8 hours | After Wave 2 |

**Total estimated effort: 15–21 hours**

Recommended approach: tackle Playwright tests first (they add safety net coverage), then ESLint waves incrementally over 2–3 PRs.

---

## Success Criteria

- [ ] `npm run test:e2e` passes with billing + stem flow coverage
- [ ] CI green with new Playwright tests
- [ ] `--max-warnings` reduced from 70 → 50 (Wave 1)
- [ ] At least 2 rule categories promoted from `warn` → `error`
- [ ] All decomposition phases remain verified (no regressions)
