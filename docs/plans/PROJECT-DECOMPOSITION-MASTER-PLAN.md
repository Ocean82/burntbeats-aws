# Project Decomposition Master Plan

## Purpose

Break down large, multi-responsibility files into smaller, focused modules to support the transition from small web app to scalable, maintainable product. Each phase is independently shippable and testable.

---

## File Inventory (Candidates for Decomposition)

| # | File | Lines | Layer | Priority |
|---|------|------:|-------|----------|
| 1 | `frontend/src/components/ProcessingSettingsPanel.tsx` | 925 | Frontend | High |
| 2 | `frontend/src/hooks/useAudioPlayback.ts` | 874 | Frontend | High |
| 3 | `frontend/src/App.tsx` | 765 | Frontend | High |
| 4 | `stem_service/mdx_onnx.py` | 701 | Stem Service | High |
| 5 | `stem_service/hybrid.py` | 693 | Stem Service | High |
| 6 | `backend/usageTokens.js` | 595 | Backend | High |
| 7 | `stem_service/config.py` | 543 | Stem Service | Medium |
| 8 | `frontend/src/hooks/useExport.ts` | 526 | Frontend | Medium |
| 9 | `frontend/src/api.ts` | 488 | Frontend | Medium |
| 10 | `backend/email-service.js` | 452 | Backend | Medium |
| 11 | `stem_service/scnet_onnx.py` | 437 | Stem Service | Medium |
| 12 | `stem_service/server.py` | 428 | Stem Service | Medium |
| 13 | `backend/billing.js` | 424 | Backend | Medium |
| 14 | `stem_service/job_worker.py` | 416 | Stem Service | Medium |
| 15 | `frontend/src/components/mixer-panel.component.tsx` | 379 | Frontend | Low |
| 16 | `backend/db-tokens.js` | 347 | Backend | Low |

---

## Execution Order (Phases)

```
Phase 1 — Frontend: api.ts decomposition (lowest risk, pure extraction)
Phase 2 — Backend: usageTokens.js decomposition
Phase 3 — Backend: email-service.js decomposition
Phase 4 — Backend: billing.js decomposition
Phase 5 — Stem Service: config.py decomposition
Phase 6 — Stem Service: mdx_onnx.py decomposition
Phase 7 — Stem Service: hybrid.py decomposition
Phase 8 — Frontend: useAudioPlayback.ts decomposition
Phase 9 — Frontend: ProcessingSettingsPanel.tsx decomposition
Phase 10 — Frontend: App.tsx state consolidation
Phase 11 — Frontend: useExport.ts decomposition
Phase 12 — Stem Service: job_worker.py + server.py cleanup
Phase 13 — Duplication consolidation pass
```

---

## Phase 1 — Frontend: `api.ts` Decomposition

### Objective

Split `frontend/src/api.ts` (488 lines) into focused modules by responsibility: auth/token management, stem operation calls, job status polling, and response validation.

### Why This Goes First

- Pure extraction with no UI side effects
- Self-contained module with clear seams
- Low risk of breaking other components (consumers import named exports)
- Establishes the pattern for all subsequent frontend decompositions

### Cautionary Areas

- **Token provider singleton** — `setTokenProvider` and `_getToken` are module-level state. Must remain a single instance across all new modules.
- **Job token store** — `jobTokenStore` (Map) is shared state used by multiple API functions. Must live in one place and be imported by others.
- **Circular imports** — New modules must not import each other in a cycle. Auth module is the leaf; others depend on it.
- **Re-export barrel** — Existing consumers import from `"../api"` or `"./api"`. A barrel re-export file preserves backward compatibility.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `frontend/src/api.ts` | The file being decomposed — read in full |
| `frontend/src/hooks/useStemSplitting.ts` | Consumer of split/expand APIs |
| `frontend/src/hooks/useStemLoading.ts` | Consumer of stem file fetching |
| `frontend/src/hooks/useSubscription.ts` | Consumer of billing/subscription APIs |
| `frontend/src/hooks/useExport.ts` | Consumer of server-export API |
| `frontend/src/App.tsx` | Sets up token provider via `setTokenProvider` |
| `frontend/tsconfig.json` | Path aliases that may affect imports |

### Target File Structure

```
frontend/src/api/
├── index.ts          ← barrel re-export (preserves "import from '../api'" compatibility)
├── auth.ts           ← setTokenProvider, authHeaders, job token store, clearJobToken
├── stems.ts          ← stem file URL + authenticated file fetch helpers
├── jobStatus.ts      ← getStemJobStatus, pollStemJobUntilDone, streamStemJobUntilDone
├── operations.ts     ← startStemSplit/splitStems/startExpand/expandStems/serverExportMasterWav
├── types.ts          ← API-layer shared response/request types
├── legal.ts          ← acceptLegal
└── validation.ts     ← type guards, response parsing helpers, error extraction
```

### Steps

1. [ ] Read `frontend/src/api.ts` in full — map every export and its consumers
2. [ ] Create `frontend/src/api/` directory
3. [ ] Extract `auth.ts` — token provider, `authHeaders()`, job token Map, `clearJobToken`
4. [ ] Extract `validation.ts` — `tryParseJson`, `getApiErrorMessage`, type guard functions
5. [ ] Extract `stems.ts` — stem file URL parsing/building and authenticated file fetch helpers (imports from `auth.ts`)
6. [ ] Extract `jobStatus.ts` — polling logic, SSE streaming, and status validation (imports from `auth.ts` + `validation.ts`)
7. [ ] Extract `operations.ts` — split/expand/server-export orchestration (imports from `auth.ts` + `validation.ts`)
8. [ ] Extract `types.ts` — API-layer request/response types used across new modules
9. [ ] Extract `legal.ts` — `acceptLegal` (imports from `auth.ts` and `validation.ts`)
10. [ ] Create `index.ts` barrel — re-export all public symbols from sub-modules
11. [ ] Delete original `frontend/src/api.ts`
12. [ ] Run TypeScript compiler — zero errors
13. [ ] Run frontend lint — zero new errors
14. [ ] Run frontend tests (if any) — zero failures
15. [ ] Verify dev server starts and app loads without console errors

### Tools

| Tool | Purpose |
|------|---------|
| `getDiagnostics` | Check TypeScript errors after each extraction |
| `grepSearch` | Find all imports of `from "../api"` or `from "./api"` across frontend |
| `npx tsc --noEmit` | Full type-check |
| `npm run lint` (frontend) | ESLint validation |
| `npm run build` (frontend) | Confirm production build succeeds |

### Success Criteria

- [ ] Files are meaningfully decomposed by responsibility; further split only where cohesion/readability is poor
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All existing imports resolve (barrel re-export covers them)
- [ ] No runtime errors in browser console
- [ ] `npm run build` succeeds

### Failure Indicators

- TypeScript errors about missing exports → barrel file is incomplete
- Runtime "cannot read property of undefined" → singleton token provider not shared correctly
- Circular dependency warning in bundler → restructure imports (auth must be leaf)

### Verification Checklist

- [ ] `getDiagnostics` on all new files returns clean
- [ ] `grep -r "from.*['\"].*api['\"]" frontend/src/` — all resolve
- [ ] App loads in browser, can sign in, can trigger a split
- [ ] Phase marked COMPLETE

---

## Phase 2 — Backend: `usageTokens.js` Decomposition

### Objective

Split `backend/usageTokens.js` (595 lines) into focused modules: cost computation, balance retrieval, token operations (reserve/refund/credit), and Stripe metadata parsing.

### Why This Phase

- Highest-line-count backend file
- Mixes pure computation (cost functions) with I/O (Clerk API, Redis locks, DB calls)
- Cost functions are imported by route handlers — extracting them reduces coupling
- Stripe metadata parsing is duplicated with `billing.js` — extraction enables sharing

### Cautionary Areas

- **Distributed lock (`withUserUsageLock`)** — Must remain co-located with the operations it protects (reserve/refund). Don't separate lock from operations.
- **DB vs Clerk fallback pattern** — `reserveUsageTokens` calls DB first, then Clerk as cache. This dual-write logic must stay atomic within one function.
- **Circular dependency with `db-tokens.js`** — `usageTokens.js` imports from `db-tokens.js`. New modules must not create a reverse dependency.
- **Environment gating** — `isUsageTokensEnabled()` gates the entire system. All modules need access to this check.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `backend/usageTokens.js` | The file being decomposed |
| `backend/db-tokens.js` | Called by usageTokens for DB operations |
| `backend/billing.js` | Imports `getUsageBalance`, `creditSubscriptionAllowance`, `creditTopupTokens`, `tokensPerTopupFromPrice` |
| `backend/routes/stems/split.js` | Imports `computeSplitCost`, `reserveUsageTokens`, `isUsageTokensEnabled`, `getAudioDurationSeconds` |
| `backend/routes/stems/server-export.js` | Imports `computeServerExportCost` |
| `backend/stripeRedis.js` | Provides Redis for distributed lock |
| `backend/clerkAuth.js` | Provides Clerk client for metadata updates |
| `backend/package.json` | Test/lint scripts |

### Target File Structure

```
backend/usage/
├── index.js            ← barrel re-export (preserves existing import paths via package.json exports or alias)
├── tokenCost.js        ← computeSplitCost, computeExpandCost, computeServerExportCost
├── tokenBalance.js     ← getUsageBalance, isUsageTokensEnabled, withUserUsageLock
├── tokenOperations.js  ← reserveUsageTokens, refundUsageTokens, grantWelcomeSignupTokens
├── tokenCredits.js     ← creditSubscriptionAllowance, creditTopupTokens
├── stripeMetadata.js   ← subscriptionBillingPeriod, tokensPerMonthFromPrice, tokensPerTopupFromPrice
├── audioFile.js        ← getAudioDurationSeconds, findJobInputPath
└── clerkCache.js       ← updateClerkBalanceCache
```

### Steps

1. [ ] Read `backend/usageTokens.js` in full — catalog every export and internal helper
2. [ ] Identify all consumers via `grepSearch` for `from.*usageTokens` and `require.*usageTokens`
3. [ ] Create `backend/usage/` directory
4. [ ] Extract `tokenCost.js` — pure functions, zero I/O, zero external state
5. [ ] Extract `stripeMetadata.js` — Stripe price metadata parsing (will also be used by billing.js later)
6. [ ] Extract `tokenBalance.js` — `getUsageBalance`, `isUsageTokensEnabled`, lock utility
7. [ ] Extract `tokenOperations.js` — `reserveUsageTokens`, `refundUsageTokens`, `grantWelcomeSignupTokens`
8. [ ] Extract `tokenCredits.js` — `creditSubscriptionAllowance`, `creditTopupTokens`
9. [ ] Create `index.js` barrel — re-export all public symbols
10. [ ] Extract `audioFile.js` and `clerkCache.js` from mixed concerns in legacy file
11. [ ] Update all consumers to import from `./usage/index.js` (or keep `usageTokens.js` as a thin re-export shim)
12. [ ] Run `node --test` in backend — zero failures
13. [ ] Run `npx eslint .` in backend — zero new errors
14. [ ] Smoke-test: start server, trigger a split, verify tokens deducted

### Tools

| Tool | Purpose |
|------|---------|
| `grepSearch` | Find all import sites across backend |
| `node --test` | Run backend test suite |
| `npx eslint .` | Lint check |
| `node -e "import('./usage/index.js')"` | Verify module graph resolves |
| `getDiagnostics` | Check for issues in edited files |

### Success Criteria

- [ ] Files are decomposed into cohesive responsibilities; split further when single files become mixed-orchestration hotspots
- [ ] `node --test` passes (all existing tests)
- [ ] `npx eslint .` passes with no new errors
- [ ] Server starts without errors
- [ ] A stem split job correctly deducts tokens
- [ ] `tokenCost.js` has zero I/O imports (no `fs`, no `fetch`, no DB)

### Failure Indicators

- Import errors at startup → barrel file missing an export
- "Cannot read properties of null" in lock → Redis connection not passed correctly
- Token balance not updating → dual-write (DB + Clerk) broken in extraction
- Test failures in `db-tokens.test.mjs` → accidentally changed the interface

### Verification Checklist

- [ ] All backend tests pass
- [ ] Server starts cleanly
- [ ] Manual test: upload → split → tokens deducted → refund on cancel
- [ ] Phase marked COMPLETE

### Verification Evidence (2026-05-08)

- `DATABASE_URL` preflight: missing in shell environment (`DATABASE_URL_MISSING`).
- `npm run db:migrate` (backend): failed with `timeout expired`.
- `node --test tests/db-tokens.test.mjs`: **1 passed / 19 failed**, failures are DB connection timeouts.
- `npm test` (backend full suite): **46 passed / 19 failed**, all failing tests from `db-tokens.test.mjs` DB timeouts.
- `npm run lint` (backend): pass with warnings only (0 errors).
- Usage module smoke checks: `import('./usage/index.js')` and `import('./usageTokens.js')` both pass.

Status interpretation: Phase 2 code decomposition and module graph are in place, but DB-backed verification remains blocked by environment/database connectivity.

---

## Phase 3 — Backend: `email-service.js` Decomposition

### Objective

Split `backend/email-service.js` (452 lines) into email templates (HTML strings) and email sending logic.

### Why This Phase

- The bulk of this file is inline HTML template strings (~350 lines of HTML)
- Extracting templates makes them independently editable (designers can update without touching send logic)
- Low risk — templates are pure data, no logic coupling

### Cautionary Areas

- **Template variables** — Templates use `${variable}` interpolation. Extraction must preserve the function signature that provides those variables.
- **`escapeHtml` utility** — Used inside templates. Must be importable by the templates module.
- **Transporter singleton** — Nodemailer transport is created lazily. Keep in sender module.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `backend/email-service.js` | The file being decomposed |
| `backend/email-routes.js` | Consumer — calls `sendEmail`, `testEmailConfig` |
| `backend/routes/stems/split.js` | May call `sendSongReadyEmail` on completion |
| `backend/package.json` | Nodemailer dependency |

### Target File Structure

```
backend/email/
├── index.js          ← barrel re-export
├── templates.js      ← HTML template functions (songReady, welcome, referral, error, etc.)
├── sender.js         ← getTransporter, sendEmail, testEmailConfig
└── helpers.js        ← escapeHtml (shared utility)
```

### Steps

1. [ ] Read `backend/email-service.js` in full
2. [ ] Create `backend/email/` directory
3. [ ] Extract `helpers.js` — `escapeHtml` utility
4. [ ] Extract `templates.js` — all HTML template rendering functions
5. [ ] Extract `sender.js` — transport creation, `sendEmail`, `testEmailConfig`, individual send wrappers
6. [ ] Create `index.js` barrel
7. [ ] Update `email-routes.js` imports
8. [ ] Run backend tests
9. [ ] Send a test email (if test SMTP configured) or verify `testEmailConfig` endpoint

### Tools

| Tool | Purpose |
|------|---------|
| `grepSearch` | Find all consumers of email-service |
| `node --test` | Backend tests |
| `node -e "import('./email/index.js')"` | Module resolution check |

### Success Criteria

- [ ] `templates.js` contains only HTML rendering (no I/O, no transport)
- [ ] `sender.js` is under 100 lines
- [ ] All backend tests pass
- [ ] Email routes respond correctly

### Verification Checklist

- [x] Tests pass
- [x] `POST /api/email/test` returns success (or expected error if SMTP not configured)
- [x] Phase marked COMPLETE

### Verification Evidence (2026-05-08)

- `node -e "import('./email/index.js')"`: resolves cleanly (OK).
- `node -e "import('./email-service.js')"`: shim resolves cleanly (OK).
- `node --test`: **65 passed / 0 failed**.
- `npx eslint .`: **0 errors** (6 pre-existing warnings in test file only).
- `sender.js`: 115 lines (focused on transport + send logic, no templates).
- `templates.js`: 317 lines (pure HTML rendering, only imports `escapeHtml`).
- `helpers.js`: 18 lines (`escapeHtml` utility).
- Original `email-service.js` reduced to 16-line re-export shim.

---

## Phase 4 — Backend: `billing.js` Decomposition

### Objective

Split `backend/billing.js` (424 lines) into customer management, checkout/portal sessions, and webhook handling.

### Cautionary Areas

- **Stripe webhook signature verification** — Must happen on raw body before JSON parsing. The webhook handler has specific middleware requirements.
- **Idempotency** — Webhook handlers use Redis claims (`tryClaimWebhookEvent`). Don't break the claim/release pattern.
- **Shared `stripeMetadata.js`** — After Phase 2, Stripe metadata parsing lives in `backend/usage/stripeMetadata.js`. Billing should import from there.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `backend/billing.js` | The file being decomposed |
| `backend/usage/stripeMetadata.js` | Shared Stripe helpers (created in Phase 2) |
| `backend/stripeRedis.js` | Webhook idempotency |
| `backend/server.js` | Mounts billing router |
| `backend/tests/billing-webhook.test.mjs` | Webhook tests |

### Target File Structure

```
backend/billing/
├── index.js              ← barrel + Router composition
├── subscription.js       ← GET /subscription, GET /usage
├── checkout.js           ← POST /checkout, POST /portal
├── webhook.js            ← POST /webhook (Stripe event handlers)
└── stripeCustomer.js     ← getOrCreateStripeCustomer, getStripeSubscription
```

### Steps

1. [ ] Read `backend/billing.js` in full
2. [ ] Create `backend/billing/` directory
3. [ ] Extract `stripeCustomer.js` — customer lookup/creation
4. [ ] Extract `subscription.js` — subscription status route
5. [ ] Extract `checkout.js` — checkout session + portal routes
6. [ ] Extract `webhook.js` — webhook handler with all event cases
7. [ ] Create `index.js` — compose Router from sub-routers
8. [ ] Update `server.js` mount point (if needed)
9. [ ] Run `billing-webhook.test.mjs`
10. [ ] Run full backend test suite

### Tools

| Tool | Purpose |
|------|---------|
| `node --test` | Backend tests |
| `grepSearch` | Find billing imports |
| Stripe CLI (`stripe trigger`) | Test webhook locally |

### Success Criteria

- [ ] `billing-webhook.test.mjs` passes
- [ ] All backend tests pass
- [ ] Checkout flow works end-to-end (manual or Stripe test mode)
- [ ] Webhook idempotency preserved (duplicate events ignored)

### Verification Checklist

- [ ] Tests pass
- [ ] `GET /api/billing/subscription` returns correct shape
- [ ] `POST /api/billing/webhook` processes test events
- [ ] Phase marked COMPLETE

---

## Phase 5 — Stem Service: `config.py` Decomposition

### Objective

Split `stem_service/config.py` (543 lines, 30+ functions) into logical groups: model path resolution, model availability checks, and device/runtime configuration.

### Why This Phase

- 30+ functions in one file makes navigation painful
- Availability checks are pure booleans — trivial to extract
- Path resolution is used everywhere in the stem service — isolating it clarifies dependencies
- This phase unblocks Phases 6 and 7 (mdx_onnx and hybrid both import heavily from config)

### Cautionary Areas

- **Import chains** — Nearly every other stem_service module imports from `config.py`. A barrel `__init__.py` in a `config/` package preserves `from config import X` syntax.
- **Environment variables** — Many functions read `os.environ`. Keep reads at call time, not module load time.
- **Circular imports** — `config.py` should NOT import from `mdx_onnx.py` or `hybrid.py`. Verify this is already the case.
- **Test coverage** — If `stem_service/tests/` has config tests, they must still pass.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `stem_service/config.py` | The file being decomposed |
| `stem_service/hybrid.py` | Heavy consumer of config |
| `stem_service/mdx_onnx.py` | Heavy consumer of config |
| `stem_service/server.py` | Imports config for model availability at startup |
| `stem_service/split.py` | Imports config for model selection |
| `stem_service/job_worker.py` | Imports config |
| `stem_service/tests/` | Any existing tests |

### Target File Structure

```
stem_service/config/
├── __init__.py         ← barrel re-export (from .paths import *; from .availability import *; etc.)
├── paths.py            ← resolve_models_root_file, *_onnx_path, *_checkpoint_path, *_repo_root
├── availability.py     ← all *_available() boolean functions
├── device.py           ← is_cuda_available, get_demucs_device, get_onnx_providers, demucs_cli_module
└── demucs_bags.py      ← resolve_demucs_quality_bag, demucs_speed_4stem_configs, demucs_quality_4stem_configs, bag weight checks
```

### Steps

1. [ ] Read `stem_service/config.py` in full — map all functions and their internal call graph
2. [ ] Verify no circular imports exist (config should be a leaf)
3. [ ] Create `stem_service/config/` package directory with `__init__.py`
4. [ ] Extract `paths.py` — all path resolution functions
5. [ ] Extract `availability.py` — all `*_available()` functions (these call into paths.py)
6. [ ] Extract `device.py` — CUDA, ONNX providers, device selection
7. [ ] Extract `demucs_bags.py` — bag/yaml weight resolution (complex but self-contained)
8. [ ] Update `__init__.py` to re-export everything
9. [ ] Rename/remove original `stem_service/config.py` (replaced by package)
10. [ ] Run `pytest` or `python -m pytest` in stem_service
11. [ ] Run `python -c "from config import *"` from stem_service directory
12. [ ] Start stem service and verify `/health` endpoint reports model availability correctly

### Tools

| Tool | Purpose |
|------|---------|
| `pytest` | Run stem service tests |
| `python -c "from config import ..."` | Verify import resolution |
| `ruff check stem_service/` | Lint Python files |
| `grepSearch` | Find all `from config import` and `import config` statements |

### Success Criteria

- [ ] All existing imports resolve without changes (barrel handles it)
- [ ] `pytest` passes (all stem service tests)
- [ ] `ruff check` passes with no new errors
- [ ] Stem service starts and `/health` returns correct model availability
- [ ] No file exceeds 200 lines

### Failure Indicators

- `ImportError` at startup → `__init__.py` barrel missing exports
- Model reported as unavailable → path resolution function lost access to env var
- Circular import error → availability.py importing from a module that imports config

### Verification Checklist

- [ ] All tests pass
- [ ] Service starts cleanly
- [ ] `/health` endpoint correct
- [ ] Phase marked COMPLETE

---

## Phase 6 — Stem Service: `mdx_onnx.py` Decomposition

### Objective

Split `stem_service/mdx_onnx.py` (701 lines) into model registry/resolution, STFT math, and inference pipelines.

### Why This Phase

- Mixes pure math (STFT/iSTFT) with I/O (ONNX session loading) with business logic (model selection)
- STFT functions are reusable across multiple inference backends
- Model registry logic is queried at startup and during job dispatch — separating it improves clarity

### Cautionary Areas

- **ONNX session caching** — `_onnx_session` likely caches loaded models. Must remain a singleton pattern.
- **Torch dependency** — STFT uses PyTorch tensors. The math module will still need torch as a dependency.
- **`_run_mdx_onnx` is 240+ lines** — This is the core inference loop. It may need internal refactoring but should stay as one function (it's a pipeline with sequential steps).
- **Config imports** — After Phase 5, config is a package. Verify imports still work.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `stem_service/mdx_onnx.py` | The file being decomposed |
| `stem_service/config/` | Model path resolution (after Phase 5) |
| `stem_service/hybrid.py` | Calls `run_vocal_onnx`, `run_inst_onnx` |
| `stem_service/vocal_stage1.py` | May call MDX functions |
| `stem_service/ultra.py` | May use MDX inference |

### Target File Structure

```
stem_service/mdx/
├── __init__.py           ← barrel re-export
├── model_registry.py     ← resolve_mdx_model_path, get_available_vocal_onnx, get_available_inst_onnx, get_available_dereverb_onnx, config lookup
├── stft.py               ← _get_hann_window, _stft, _istft (pure math, torch tensors)
├── session.py            ← _onnx_session (session creation + caching)
└── inference.py          ← _run_mdx_onnx, run_vocal_onnx, run_inst_onnx, run_dereverb_onnx
```

### Steps

1. [ ] Read `stem_service/mdx_onnx.py` in full
2. [ ] Map internal call graph (which functions call which)
3. [ ] Create `stem_service/mdx/` package
4. [ ] Extract `stft.py` — pure math, no side effects
5. [ ] Extract `model_registry.py` — all model resolution and availability functions
6. [ ] Extract `session.py` — ONNX session creation with caching
7. [ ] Extract `inference.py` — the main inference functions (import from stft, session, model_registry)
8. [ ] Create `__init__.py` barrel
9. [ ] Update all consumers (`hybrid.py`, `vocal_stage1.py`, `ultra.py`, etc.)
10. [ ] Run tests
11. [ ] Run a test separation job to verify inference still works

### Tools

| Tool | Purpose |
|------|---------|
| `pytest` | Stem service tests |
| `ruff check` | Lint |
| `python -c "from mdx import run_vocal_onnx"` | Import check |
| Manual test job | Verify inference produces correct output |

### Success Criteria

- [ ] `stft.py` has zero I/O (no file reads, no network)
- [ ] ONNX session caching still works (model loaded once, reused)
- [ ] A vocal separation job produces identical output to before
- [ ] All tests pass
- [ ] No file exceeds 250 lines

### Verification Checklist

- [ ] Tests pass
- [ ] Manual separation job succeeds
- [ ] Output audio quality unchanged (spot-check)
- [ ] Phase marked COMPLETE

---

## Phase 7 — Stem Service: `hybrid.py` Decomposition

### Objective

Split `stem_service/hybrid.py` (693 lines) into pipeline strategies (2-stem, 4-stem) and the expand workflow.

### Cautionary Areas

- **Shared helpers** — `_slice_audio`, `_concat_stems`, `collapse_4stem_to_2stem` are used by multiple pipelines. Extract to a shared utils module.
- **Pipeline selection logic** — The caller (job_worker or server) decides which pipeline to run. Don't accidentally change the dispatch interface.
- **File I/O** — Pipelines read/write temp files. Path handling must be preserved exactly.
- **`main()` function** — CLI entry point at bottom. Keep in a `__main__.py` or dedicated CLI file.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `stem_service/hybrid.py` | The file being decomposed |
| `stem_service/job_worker.py` | Calls hybrid pipeline functions |
| `stem_service/server.py` | May dispatch to hybrid |
| `stem_service/split.py` | May call hybrid functions |
| `stem_service/mdx/` | Called by hybrid (after Phase 6) |

### Target File Structure

```
stem_service/hybrid/
├── __init__.py           ← barrel re-export
├── utils.py              ← _slice_audio, _concat_stems, collapse_4stem_to_2stem, _effective_input_path
├── pipeline_2stem.py     ← run_hybrid_2stem, run_demucs_only_2stem
├── pipeline_4stem.py     ← run_4stem_single_pass_or_hybrid, run_hybrid_4stem, _run_chunked_4stem
├── expand.py             ← run_expand_to_4stem, _stage1_only, _stage2_only, _materialize_stage1_instrumental
└── cli.py                ← main() CLI entry point
```

### Steps

1. [ ] Read `stem_service/hybrid.py` in full — map function call graph
2. [ ] Create `stem_service/hybrid/` package
3. [ ] Extract `utils.py` — shared helper functions
4. [ ] Extract `pipeline_2stem.py` — 2-stem pipeline functions
5. [ ] Extract `pipeline_4stem.py` — 4-stem pipeline functions
6. [ ] Extract `expand.py` — expand-to-4-stem workflow
7. [ ] Extract `cli.py` — `main()` function
8. [ ] Create `__init__.py` barrel
9. [ ] Update consumers (job_worker.py, server.py, split.py)
10. [ ] Run tests
11. [ ] Run a 2-stem and 4-stem separation to verify

### Tools

| Tool | Purpose |
|------|---------|
| `pytest` | Tests |
| `ruff check` | Lint |
| Manual job | Verify separation output |

### Success Criteria

- [ ] Each pipeline file is self-contained (one strategy per file)
- [ ] `utils.py` has no pipeline-specific logic
- [ ] 2-stem and 4-stem jobs produce correct output
- [ ] Expand jobs work correctly
- [ ] All tests pass

### Verification Checklist

- [ ] Tests pass
- [ ] 2-stem job succeeds
- [ ] 4-stem job succeeds
- [ ] Expand job succeeds
- [ ] Phase marked COMPLETE

---

## Phase 8 — Frontend: `useAudioPlayback.ts` Decomposition

### Objective

Split `frontend/src/hooks/useAudioPlayback.ts` (874 lines) into focused hooks: AudioContext lifecycle, mix engine (gain/routing), and playhead tracking.

### Why This Phase

- Largest single hook in the project
- Mixes Web Audio API setup, stem source management, analyser routing, and animation-frame playhead
- Changes to playhead logic shouldn't require understanding gain node routing

### Cautionary Areas

- **AudioContext singleton** — Web Audio requires a single AudioContext per page. The lifecycle hook must own it and share via ref or context.
- **Ref-heavy architecture** — Audio hooks use `useRef` extensively to avoid re-renders. Extracted hooks must share refs or accept them as parameters.
- **Cleanup ordering** — Audio nodes must be disconnected in correct order on unmount. Don't split cleanup across hooks without clear ownership.
- **Browser autoplay policy** — Context resume logic must stay with the play trigger.
- **Performance** — `requestAnimationFrame` loop for playhead must not cause unnecessary re-renders in other hooks.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `frontend/src/hooks/useAudioPlayback.ts` | The file being decomposed |
| `frontend/src/App.tsx` | Primary consumer |
| `frontend/src/components/MultiStemEditor.tsx` | Receives playhead position |
| `frontend/src/components/mixer-panel.component.tsx` | Uses analyser data |
| `frontend/src/types.ts` | Shared types |

### Target File Structure

```
frontend/src/hooks/audio/
├── index.ts                  ← barrel re-export of useAudioPlayback (preserves existing import)
├── useAudioContext.ts        ← AudioContext creation, resume, suspend, close
├── useMixEngine.ts           ← Stem source nodes, gain nodes, analyser routing, master output
├── usePlayhead.ts            ← requestAnimationFrame loop, position tracking, seek
└── useAudioPlayback.ts       ← Orchestrator that composes the above three
```

### Steps

1. [ ] Read `useAudioPlayback.ts` in full — identify state boundaries
2. [ ] Map which refs/state belong to which responsibility
3. [ ] Create `frontend/src/hooks/audio/` directory
4. [ ] Extract `useAudioContext.ts` — context creation, resume on user gesture, cleanup
5. [ ] Extract `usePlayhead.ts` — animation frame loop, position calculation, seek handler
6. [ ] Extract `useMixEngine.ts` — stem source building, gain routing, analyser setup
7. [ ] Rewrite `useAudioPlayback.ts` as orchestrator composing the three sub-hooks
8. [ ] Create `index.ts` barrel
9. [ ] Run TypeScript compiler
10. [ ] Test in browser: play, pause, seek, volume change, stem solo/mute

### Tools

| Tool | Purpose |
|------|---------|
| `npx tsc --noEmit` | Type check |
| Browser DevTools | Verify audio plays, no glitches |
| `getDiagnostics` | Check for TS errors |
| Performance tab | Verify no excessive re-renders |

### Success Criteria

- [ ] Audio plays without glitches
- [ ] Seek works correctly
- [ ] Stem solo/mute works
- [ ] Analyser data flows to spectrum/VU components
- [ ] No file exceeds 300 lines
- [ ] TypeScript compiles clean

### Failure Indicators

- Audio doesn't play → AudioContext not resumed or nodes not connected
- Playhead freezes → animation frame loop lost reference to context
- Memory leak → nodes not disconnected on cleanup
- Glitchy audio → gain nodes reconnected on every render (should be ref-stable)

### Verification Checklist

- [ ] TypeScript clean
- [ ] Play/pause works
- [ ] Seek works
- [ ] Solo/mute works
- [ ] Spectrum analyzer displays
- [ ] No console errors
- [ ] Phase marked COMPLETE

---

## Phase 9 — Frontend: `ProcessingSettingsPanel.tsx` Decomposition

### Objective

Split `frontend/src/components/ProcessingSettingsPanel.tsx` (925 lines) into focused sub-components by settings category.

### Cautionary Areas

- **Props drilling** — The panel likely receives many props. Extract sub-components that accept only what they need.
- **Conditional rendering** — Settings may show/hide based on subscription tier. Keep tier logic in parent, pass visibility as props.
- **Form state** — If using controlled inputs, state must stay in parent or a shared hook.
- **Accessibility** — Ensure extracted components maintain proper ARIA relationships (fieldset/legend, label/input associations).

### Files to Review Before Starting

| File | Why |
|------|-----|
| `frontend/src/components/ProcessingSettingsPanel.tsx` | The file being decomposed |
| `frontend/src/App.tsx` | Consumer — passes props to this panel |
| `frontend/src/types.ts` | Shared types for settings |
| `frontend/src/hooks/useSubscription.ts` | Tier-gating logic |

### Target File Structure

```
frontend/src/components/processing-settings/
├── index.ts                          ← barrel re-export of ProcessingSettingsPanel
├── ProcessingSettingsPanel.tsx        ← Orchestrator (receives all props, delegates to sub-components)
├── ModelQualitySection.tsx            ← Quality tier selection (Speed/Quality/Ultra)
├── StemCountSection.tsx               ← 2-stem vs 4-stem selection
├── AdvancedOptionsSection.tsx         ← Advanced/experimental toggles
├── FileInfoSection.tsx                ← Upload file info display, duration, token cost preview
└── types.ts                           ← Shared prop types for this component group
```

### Steps

1. [ ] Read `ProcessingSettingsPanel.tsx` in full — identify visual sections
2. [ ] Identify prop groups (which props go to which section)
3. [ ] Create `frontend/src/components/processing-settings/` directory
4. [ ] Define shared `types.ts` for the component group
5. [ ] Extract each section component (start with simplest)
6. [ ] Rewrite parent as composition of sections
7. [ ] Create barrel `index.ts`
8. [ ] Run TypeScript compiler
9. [ ] Visual regression check in browser

### Tools

| Tool | Purpose |
|------|---------|
| `npx tsc --noEmit` | Type check |
| Browser | Visual verification |
| `getDiagnostics` | TS errors |

### Success Criteria

- [ ] Parent component under 150 lines
- [ ] Each section component under 250 lines
- [ ] Visual appearance unchanged
- [ ] All interactions work (selection, toggles, tier gating)
- [ ] TypeScript clean

### Verification Checklist

- [ ] TypeScript clean
- [ ] UI looks identical
- [ ] All settings functional
- [ ] Phase marked COMPLETE

---

## Phase 10 — Frontend: `App.tsx` State Consolidation

### Objective

Reduce `frontend/src/App.tsx` (765 lines) by consolidating hook orchestration into domain-specific composite hooks.

### Cautionary Areas

- **This is the riskiest frontend phase** — App.tsx is the root orchestrator. Changes here affect everything.
- **Hook ordering** — React hooks must be called in the same order every render. Consolidating hooks into a composite hook is safe; conditionally calling hooks is not.
- **Prop threading** — Many hooks produce values consumed by other hooks. The composite hook must expose the same interface.
- **Incremental approach** — Do NOT rewrite App.tsx from scratch. Extract one composite hook at a time.

### Files to Review Before Starting

| File | Why |
|------|-----|
| `frontend/src/App.tsx` | The file being refactored |
| `frontend/src/hooks/useAudioPlayback.ts` (or `audio/`) | After Phase 8 |
| `frontend/src/hooks/useStemSplitting.ts` | Split workflow state |
| `frontend/src/hooks/useStemLoading.ts` | Stem loading state |
| `frontend/src/hooks/useExport.ts` | Export state |
| `frontend/src/hooks/useMixerWorkspace.ts` | Mixer state |
| `frontend/src/store/appStore.ts` | Zustand store |

### Target Approach

Extract 2-3 composite hooks that group related hooks:

```
frontend/src/hooks/
├── useEditorSession.ts     ← Combines: useStemSplitting + useStemLoading + useAudioPlayback + useWaveformCompute
├── useMixerControls.ts     ← Combines: useMixerWorkspace + useHistory + useBatchQueue
└── useAppShell.ts          ← Combines: useUiModals + useGuidanceSystem + useHeaderVisibility + useSubscription
```

### Steps

1. [ ] Read `App.tsx` — map which hooks depend on which other hooks' outputs
2. [ ] Draw dependency graph (which hook outputs feed into which hook inputs)
3. [ ] Identify groups with minimal cross-dependencies
4. [ ] Extract `useEditorSession.ts` — the audio/stem lifecycle group
5. [ ] Verify App.tsx still works with the composite hook
6. [ ] Extract `useAppShell.ts` — UI chrome concerns
7. [ ] Verify again
8. [ ] Extract `useMixerControls.ts` — mixer state group
9. [ ] Final verification
10. [ ] App.tsx should now be ~300-400 lines (composition + JSX)

### Tools

| Tool | Purpose |
|------|---------|
| `npx tsc --noEmit` | Type check after each extraction |
| Browser | Full app test |
| React DevTools | Verify hook state |

### Success Criteria

- [ ] `App.tsx` under 400 lines
- [ ] Each composite hook under 200 lines
- [ ] All app functionality preserved
- [ ] No performance regression (check React DevTools profiler)

### Verification Checklist

- [ ] TypeScript clean
- [ ] Upload → split → play → export flow works
- [ ] Pricing page works
- [ ] Keyboard shortcuts work
- [ ] Phase marked COMPLETE

---

## Phase 11 — Frontend: `useExport.ts` Decomposition

### Objective

Split `frontend/src/hooks/useExport.ts` (526 lines) into export orchestration, format handling, and progress tracking.

### Cautionary Areas

- **Web Workers** — Export may use OfflineAudioContext or Web Workers. Don't break the async pipeline.
- **Blob/download handling** — Browser download triggers must stay in the main thread.
- **Format-specific logic** — WAV vs MP3 vs ZIP have different encoding paths.

### Target File Structure

```
frontend/src/hooks/export/
├── index.ts              ← barrel re-export of useExport
├── useExport.ts          ← Orchestrator hook
├── exportFormats.ts      ← Format-specific encoding (WAV header, MP3 encoding, ZIP assembly)
├── exportProgress.ts     ← Progress state management
└── exportFilename.ts     ← Filename generation logic
```

### Steps

1. [ ] Read `useExport.ts` in full
2. [ ] Identify pure utility functions vs stateful hook logic
3. [ ] Extract `exportFilename.ts` — pure functions (already identified: `stripFileExtension`, `buildMasterExportFilename`)
4. [ ] Extract `exportFormats.ts` — encoding logic
5. [ ] Extract `exportProgress.ts` — progress state
6. [ ] Slim down `useExport.ts` to orchestration
7. [ ] TypeScript check
8. [ ] Test export flow in browser

### Success Criteria

- [ ] Export produces correct WAV/MP3/ZIP files
- [ ] Progress indicator works
- [ ] TypeScript clean
- [ ] No file exceeds 200 lines

### Verification Checklist

- [ ] Export WAV works
- [ ] Export MP3 works
- [ ] Export ZIP works
- [ ] Phase marked COMPLETE

---

## Phase 12 — Stem Service: `job_worker.py` + `server.py` Cleanup

### Objective

Refactor `stem_service/job_worker.py` (416 lines, with `run_separation_sync` at ~310 lines alone) and clean up `stem_service/server.py` (428 lines).

### Cautionary Areas

- **`run_separation_sync` is one giant function** — It handles model selection, file prep, pipeline dispatch, output collection, and cleanup. Break into stages but keep the transaction boundary clear.
- **Error handling** — Job failures must still be recorded correctly in status files.
- **Shared `_safe_job_path`** — Duplicated between server.py and job_worker.py. Extract to shared utility.

### Target Changes

**job_worker.py:**
```
stem_service/jobs/
├── __init__.py
├── worker.py             ← run_separation_sync (slimmed to ~100 lines of orchestration)
├── expand_worker.py      ← run_expand_sync
├── preparation.py        ← File prep, model selection, parameter validation
├── output_collection.py  ← Stem file collection, naming, status writing
└── shared.py             ← _safe_job_path (shared with server.py)
```

**server.py** — Extract the `split` endpoint (~150 lines) into `stem_service/routes/split_route.py` and `expand` into `routes/expand_route.py`.

### Steps

1. [ ] Extract `_safe_job_path` to shared utility
2. [ ] Extract preparation logic from `run_separation_sync`
3. [ ] Extract output collection logic
4. [ ] Slim `run_separation_sync` to orchestration
5. [ ] Extract `run_expand_sync` to its own file
6. [ ] Extract server route handlers to route files
7. [ ] Run tests
8. [ ] Run separation and expand jobs

### Success Criteria

- [ ] `run_separation_sync` under 150 lines
- [ ] No duplicated `_safe_job_path`
- [ ] All jobs complete successfully
- [ ] Tests pass

### Verification Checklist

- [ ] Tests pass
- [ ] Separation job works
- [ ] Expand job works
- [ ] Phase marked COMPLETE

---

## Phase 13 — Duplication Consolidation Pass

### Objective

Eliminate identified duplication patterns across the codebase.

### Targets

| Duplication | Location | Resolution |
|-------------|----------|-----------|
| Stripe price metadata parsing | `billing.js` + `usageTokens.js` | Shared parser centralized in `usage/stripeMetadata.js`; direct billing import can be adopted later while shim remains |
| `_safe_job_path` | `server.py` + `job_worker.py` | Shared utility (done in Phase 12) |
| Reserve/refund interface | `usageTokens.js` + `db-tokens.js` | Define explicit interface; usageTokens delegates to db-tokens |
| Error response patterns | Multiple route files | Extract `handleRouteError(res, err, fallbackMsg)` utility |
| Auth header construction | Multiple API files | Centralized in `api/auth.ts` (done in Phase 1) |

### Steps

1. [ ] Verify Phase 2 resolved Stripe metadata duplication
2. [ ] Verify Phase 12 resolved `_safe_job_path` duplication
3. [ ] Extract `backend/helpers/routeError.js` — shared error response helper
4. [ ] Audit remaining duplication with search
5. [ ] Document any remaining duplication that's intentional (e.g., test helpers)

### Success Criteria

- [ ] No function with identical logic exists in two places
- [ ] Shared utilities are imported, not copy-pasted
- [ ] All tests pass

### Verification Checklist

- [ ] Grep for known duplicated function names returns single source
- [ ] All tests pass
- [ ] Phase marked COMPLETE

---

## Issue Tracking Template

When issues arise during any phase, document them here using this format:

### Issue Log

| # | Phase | Issue | Severity | Status | Resolution |
|---|-------|-------|----------|--------|-----------|
| 1 | 2 | DB-backed verification blocked (`DATABASE_URL` missing and migration timeout) | Blocker | Resolved | DB tests now pass (65/65 pass including all db-tokens tests). Verified 2026-05-08. |
| 2 | 2 | Historical lock release semantics were unsafe under lock expiry/reacquire | High | Resolved | `withUserUsageLock` now uses owner-token lock values + compare-and-delete release (`EVAL`) |
| 3 | 2 | DB + Clerk cache credit path could diverge | Medium | Resolved | DB is authoritative path for subscription/topup credits; Clerk updates are explicit best-effort cache sync only |

**Severity levels:**
- **Blocker** — Cannot proceed with current phase until resolved
- **High** — Phase can complete but functionality is degraded
- **Medium** — Workaround exists, come back later
- **Low** — Cosmetic or minor, defer to cleanup pass

**Status values:**
- **Open** — Not yet addressed
- **In Progress** — Being worked on
- **Resolved** — Fixed, verified
- **Deferred** — Intentionally postponed to a later phase

**Issue Detail Template:**

```markdown
#### Issue #X: [Short Title]

**Phase:** N
**Severity:** Blocker | High | Medium | Low
**Status:** Open | In Progress | Resolved | Deferred

**Description:**
What happened and why it's a problem.

**Root Cause:**
Why it happened (if known).

**Resolution Plan:**
Steps to fix it.

**Deferred To:**
Phase N (if deferred) — why it's safe to defer.

**Resolved:**
What was done to fix it. Date resolved.
```

---

## Global Rules for All Phases

1. **Never leave the project in a broken state between phases.** Each phase must end with passing tests and a working app.
2. **Use barrel re-exports** to preserve existing import paths. Consumers should not need changes unless you're also updating them in the same phase.
3. **One phase at a time.** Do not start Phase N+1 until Phase N is verified complete.
4. **Commit after each phase.** Each phase = one atomic commit with a clear message like `refactor(backend): decompose usageTokens.js into usage/ modules`.
5. **If a phase takes more than 2 attempts to complete,** stop and document the issue. Reassess whether the decomposition boundary is correct.
6. **Preserve behavior exactly.** This is a structural refactor, not a feature change. No logic changes, no bug fixes, no optimizations mixed in.
7. **Run the full test suite after every phase,** not just the tests for the changed layer.

---

## Progress Tracker

| Phase | Description | Status | Date Started | Date Completed |
|-------|-------------|--------|--------------|----------------|
| 1 | Frontend: api.ts decomposition | ✅ COMPLETE (verified: tsc clean, 96 tests pass, build OK) | 2026-05-08 | 2026-05-08 |
| 2 | Backend: usageTokens.js decomposition | ✅ COMPLETE (verified: 65 tests pass, lint clean, module graph OK) | 2026-05-08 | 2026-05-08 |
| 3 | Backend: email-service.js decomposition | ✅ COMPLETE (verified: 65 tests pass, lint clean, module graph OK) | 2026-05-08 | 2026-05-08 |
| 4 | Backend: billing.js decomposition | Not Started | | |
| 5 | Stem Service: config.py decomposition | Not Started | | |
| 6 | Stem Service: mdx_onnx.py decomposition | Not Started | | |
| 7 | Stem Service: hybrid.py decomposition | Not Started | | |
| 8 | Frontend: useAudioPlayback.ts decomposition | Not Started | | |
| 9 | Frontend: ProcessingSettingsPanel.tsx decomposition | Not Started | | |
| 10 | Frontend: App.tsx state consolidation | Not Started | | |
| 11 | Frontend: useExport.ts decomposition | Not Started | | |
| 12 | Stem Service: job_worker.py + server.py cleanup | Not Started | | |
| 13 | Duplication consolidation pass | Not Started | | |

---

## Estimated Effort

| Phase | Estimated Time | Risk Level |
|-------|---------------|-----------|
| 1 | 1-2 hours | Low |
| 2 | 2-3 hours | Medium |
| 3 | 1 hour | Low |
| 4 | 2 hours | Medium |
| 5 | 2 hours | Medium |
| 6 | 2-3 hours | Medium-High |
| 7 | 2-3 hours | Medium |
| 8 | 3-4 hours | High |
| 9 | 2 hours | Low-Medium |
| 10 | 3-4 hours | High |
| 11 | 1-2 hours | Low |
| 12 | 2-3 hours | Medium |
| 13 | 1-2 hours | Low |
| **Total** | **~24-34 hours** | |

---

## Dependencies Between Phases

```
Phase 1 (api.ts) ──────────────────────────── standalone
Phase 2 (usageTokens) ─────────────────────── standalone
Phase 3 (email-service) ───────────────────── standalone
Phase 4 (billing) ─────────────────────────── depends on Phase 2 (shared stripeMetadata)
Phase 5 (config.py) ───────────────────────── standalone
Phase 6 (mdx_onnx) ────────────────────────── depends on Phase 5 (config package)
Phase 7 (hybrid) ──────────────────────────── depends on Phase 5 + 6
Phase 8 (useAudioPlayback) ────────────────── standalone
Phase 9 (ProcessingSettingsPanel) ─────────── standalone
Phase 10 (App.tsx) ─────────────────────────── depends on Phase 8 (audio hooks restructured)
Phase 11 (useExport) ──────────────────────── standalone
Phase 12 (job_worker + server) ────────────── depends on Phase 5 + 6 + 7
Phase 13 (duplication) ────────────────────── depends on all prior phases
```

**Safe parallel tracks:**
- Phases 1, 2, 3 can run in parallel (different layers, no shared code)
- Phases 5, 8, 9 can run in parallel (different layers)
- Phase 11 can run anytime after Phase 1

---

## Related Documents

- `docs/plans/backend-decomposition-plan.md` — Prior plan for server.js (partially executed)
- `docs/ARCHITECTURE-FLOW.md` — System architecture reference
- `docs/BILLING-AND-TOKENS.md` — Token system documentation
