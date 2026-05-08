# Backend Decomposition Plan: Split `server.js` into Route Modules

## Overview

Extract route handlers and shared infrastructure from `backend/server.js` (1,659 lines) into focused modules, leaving `server.js` as a slim composition root (~100–120 lines).

## Scope Clarification

This plan is scoped to `backend/server.js` decomposition only (routing/composition-root extraction).

- Frontend Phase 1 (`frontend/src/api.ts` decomposition) and Backend Phase 2 (`backend/usageTokens.js` decomposition) are tracked in `docs/plans/PROJECT-DECOMPOSITION-MASTER-PLAN.md`.
- Use this document for server-route decomposition verification and use the master plan for Phase 1/2 module-map and status tracking.

---

## Reference Files

| File | Role |
|------|------|
| `backend/server.js` | Source file being decomposed |
| `backend/server.test.js` | Primary integration tests (imports `{ app }` from `server.js`) |
| `backend/tests/auth-gates.test.mjs` | Auth/job-token integration tests (imports `server.js`) |
| `backend/tests/billing-webhook.test.mjs` | Billing webhook tests |
| `backend/tests/db-tokens.test.mjs` | Token DB tests |
| `backend/email-routes.js` | Existing extracted router — pattern to follow |
| `backend/billing.js` | Existing extracted router — pattern to follow |
| `backend/clerkWebhook.js` | Existing extracted router — pattern to follow |
| `backend/package.json` | Scripts: `npm test`, `npm run lint` |
| `backend/eslint.config.js` | Lint config (update file list after refactor) |

## Tools & Commands

| Tool | Purpose |
|------|---------|
| `node --test` (in `backend/`) | Run all test files (`*.test.js`, `tests/*.test.mjs`) |
| `npx eslint .` (in `backend/`) | Lint all JS files |
| `node -e "import('./server.js')"` | Quick smoke-test that the module graph resolves |
| `getDiagnostics` | Check for type/import errors in edited files |

---

## Goals & Steps

### Goal 1: Extract shared helpers and middleware

**What:** Move reusable utilities out of `server.js` into dedicated modules so route files can import them without circular dependencies.

**Files to create:**

| New File | Contents |
|----------|----------|
| `backend/middleware/auth.js` | `authMiddleware`, `requireUsageAuthPreUpload`, `jobTokenMiddleware`, `issueJobToken`, `verifyJobToken` |
| `backend/middleware/rateLimiter.js` | `rateLimitMiddleware`, `stemFileRateLimitMiddleware`, `serverExportRateLimitMiddleware`, rate-limit stores, prune interval |
| `backend/middleware/proxy.js` | `proxyFormRequest`, `withStemServiceAuthHeader`, `isProxyHttpError`, `extractProxyErrorMessage` |
| `backend/middleware/upload.js` | Multer config, `ALLOWED_AUDIO_MIMES`, `ALLOWED_AUDIO_EXTS`, `MAX_UPLOAD_MB`, `UPLOAD_TMP_DIR` |
| `backend/helpers/validation.js` | `UUID_REGEX`, `ALLOWED_STEM_IDS`, `validateStemFileParams` |
| `backend/helpers/baseUrl.js` | `getBaseUrl` |

**How:**
1. Create each file with the relevant functions/constants, exported as named exports.
2. Each module imports only what it needs (e.g., `crypto`, `express`, env vars).
3. Constants like `STEM_SERVICE_URL`, `STEM_OUTPUT_DIR`, `JOB_TOKEN_SECRET` are read from `process.env` at call time (not module-load time) where possible, or exported as lazy getters.

**Verification:**
- `node -e "import('./middleware/auth.js')"` — no import errors
- `node -e "import('./middleware/rateLimiter.js')"` — no import errors
- `node -e "import('./middleware/proxy.js')"` — no import errors
- `node -e "import('./middleware/upload.js')"` — no import errors
- `node -e "import('./helpers/validation.js')"` — no import errors
- `getDiagnostics` on each new file — zero errors

---

### Goal 2: Extract route modules

**What:** Move route handler code into Express `Router()` modules.

**Files to create:**

| New File | Routes Contained |
|----------|-----------------|
| `backend/routes/stems.js` | `POST /split`, `GET /status/:job_id`, `GET /status/:job_id/stream`, `POST /expand`, `POST /server-export`, `GET /file/:job_id/:stemId`, `DELETE /:job_id`, `POST /cleanup`, `GET /cleanup` |
| `backend/routes/legal.js` | `POST /accept` |
| `backend/routes/health.js` | `GET /` (mounted at `/api/health`) |
| `backend/routes/history.js` | `GET /jobs/history`, `GET /billing/token-history` |

**How:**
1. Each file exports a `Router()` instance.
2. Route handlers are moved verbatim (copy-paste, then update imports to point at the new middleware/helper modules).
3. Middleware that applies to specific routes (e.g., `stemFileRateLimitMiddleware` on file GET) stays inline on the route definition inside the router.
4. The `stems.js` router is the largest (~900 lines) but is cohesive — all stem lifecycle operations.

**Verification:**
- `node -e "import('./routes/stems.js')"` — resolves without error
- `node -e "import('./routes/legal.js')"` — resolves without error
- `node -e "import('./routes/health.js')"` — resolves without error
- `node -e "import('./routes/history.js')"` — resolves without error
- `getDiagnostics` on each new file — zero errors

---

### Goal 3: Rewrite `server.js` as composition root

**What:** Strip `server.js` down to: imports, env validation, app creation, global middleware (helmet, cors, json, request logging), router mounting, global error handler, and startup/shutdown.

**Structure of new `server.js`:**
```
1. Imports (routers + global middleware)
2. Env validation block (unchanged)
3. `export const app = express()`
4. `app.set("trust proxy", 1)`
5. Global middleware: helmet, request logger, raw-body for webhooks, cors, express.json, global rate limiter
6. Router mounts:
   - app.use("/api/email", emailRouter)
   - app.use("/api/billing", billingRouter)
   - app.use("/api/clerk", clerkWebhookRouter)
   - app.use("/api/stems", stemsRouter)
   - app.use("/api/legal", legalRouter)
   - app.use("/api/health", healthRouter)
   - app.use("/api/jobs", historyRouter)  // also mounts /api/billing/token-history
   - app.use("/api/billing/token-history", tokenHistoryRouter) // or inline
7. Global error handler
8. main() + gracefulShutdown()
```

**How:**
1. Remove all route handler code and helper functions from `server.js`.
2. Import routers from `./routes/*.js`.
3. Import global rate limiter from `./middleware/rateLimiter.js`.
4. Keep env validation, CORS config, request logging, and startup/shutdown in `server.js`.

**Verification:**
- `node -e "import('./server.js')"` with `BACKEND_SKIP_START=1 NODE_ENV=test` — module loads cleanly
- `getDiagnostics` on `server.js` — zero errors
- File is under 150 lines

---

### Goal 4: Update lint config

**What:** The `lint` script in `package.json` currently targets only `server.js malwareScan.js`. Update to lint all backend JS.

**How:**
- Change `"lint": "eslint server.js malwareScan.js"` → `"lint": "eslint ."` with appropriate ignores in `eslint.config.js` (add `node_modules` ignore, already has `**/*.md`).

**Verification:**
- `npm run lint` exits 0 (or only pre-existing warnings, no new errors)

---

### Goal 5: Run full test suite — confirm zero regressions

**What:** All existing tests must pass without modification (or with minimal import-path updates if any test directly imported a helper from `server.js`).

**How:**
1. Run `npm test` in `backend/`.
2. Inspect results: `server.test.js`, `tests/auth-gates.test.mjs`, `tests/billing-webhook.test.mjs`, `tests/db-tokens.test.mjs`, `clerkWebhook.test.js`, `clientSafeError.test.js`, `uploadSniff.test.js`, `malwareScan.test.mjs`.
3. All tests import `{ app }` from `./server.js` — this export remains unchanged, so no test modifications should be needed.

**Verification:**
- `npm test` exits 0
- No test file requires import path changes (the `app` export stays in `server.js`)

---

### Goal 6: Smoke-test the running server

**What:** Start the server and hit key endpoints to confirm runtime behavior.

**How:**
1. Start server: `node server.js` (or use the test harness).
2. `curl http://localhost:3001/api/health` → 200, `{ "status": "ok" | "degraded" }`.
3. `curl -X POST http://localhost:3001/api/stems/cleanup` → 503 (API_KEY not set) or 200.
4. `curl http://localhost:3001/api/stems/status/not-a-uuid` → 400.

**Verification:**
- Health endpoint responds correctly
- Error responses match pre-refactor behavior

---

## Execution Order

```
Step 1 → Goal 1 (extract helpers/middleware)
Step 2 → Goal 2 (extract route modules)
Step 3 → Goal 3 (rewrite server.js as composition root)
Step 4 → Goal 4 (update lint config)
Step 5 → Goal 5 (run tests)
Step 6 → Goal 6 (smoke test)
```

Steps 1–3 are done as a single atomic change (all files created/modified together) to avoid a broken intermediate state.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Broken imports at runtime | Each new module is smoke-tested with dynamic `import()` before proceeding |
| Rate-limiter state lost | Stores remain in-memory singletons inside `rateLimiter.js` — same behavior |
| Test failures from import changes | `app` export stays in `server.js`; tests don't import helpers directly |
| Env vars read too early | Helpers read `process.env` at call time, not module load time |
| Git blame lost | Single commit with clear message; `git log --follow` still works |

---

## Success Criteria

- [ ] `server.js` is ≤ 150 lines
- [ ] All routes respond identically to pre-refactor (same status codes, same JSON shapes)
- [ ] `npm test` passes with 0 failures
- [ ] `npm run lint` passes with no new errors
- [ ] No circular dependency warnings at startup
- [ ] Each new file is < 400 lines
