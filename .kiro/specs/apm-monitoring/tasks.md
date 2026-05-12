# Implementation Plan: APM Monitoring

## Overview

Integrate Sentry APM across all three Burnt Beats services (frontend, backend, stem service) with error tracking, performance monitoring, distributed tracing, data filtering, and source map uploads. Each service gets an independent init module that gracefully degrades when no DSN is configured.

## Tasks

- [x] 1. Install dependencies and create backend Sentry module
  - [x] 1.1 Install @sentry/node in backend
    - Run `npm install @sentry/node` in the backend directory
    - _Requirements: 3.1, 4.1_

  - [x] 1.2 Create `backend/sentry.js` initialization module
    - Export `initSentry()` function that reads `SENTRY_DSN` from `process.env`
    - If DSN is empty/undefined, skip initialization (log to console and return)
    - Configure: `tracesSampleRate: 0.2`, `sendDefaultPii: false`, `environment` from `NODE_ENV`, `release` from `SENTRY_RELEASE`
    - Add `beforeSend` hook that strips `Authorization`, `Cookie`, and `x-api-key` headers from request data
    - Export `sentryErrorHandler()` that returns the Sentry Express error handler middleware
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 4.3, 8.1_

  - [x] 1.3 Integrate Sentry into `backend/server.js`
    - Import and call `initSentry()` at the very top of the file (before Express setup)
    - Import and mount `sentryErrorHandler()` after all route handlers
    - _Requirements: 3.1, 3.2, 3.3, 4.2, 4.4_

- [x] 2. Install dependencies and create frontend Sentry module
  - [x] 2.1 Install @sentry/react and @sentry/vite-plugin in frontend
    - Run `npm install @sentry/react` and `npm install -D @sentry/vite-plugin` in the frontend directory
    - _Requirements: 1.1, 2.1_

  - [x] 2.2 Create `frontend/src/lib/sentry.ts` initialization module
    - Export `initSentry()` function that reads `import.meta.env.VITE_SENTRY_DSN`
    - If DSN is empty/undefined, skip initialization and return
    - Configure: `tracesSampleRate: 0.1`, `sendDefaultPii: false`, `environment` from `VITE_SENTRY_ENVIRONMENT` or "production", `release` from `VITE_SENTRY_RELEASE`
    - Enable `BrowserTracing` integration for page load and navigation transactions
    - Add `beforeBreadcrumb` hook that redacts Clerk session tokens (`__session=...`) and Stripe publishable keys (`pk_live_...`, `pk_test_...`) from XHR/fetch breadcrumb URLs and bodies
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 8.2, 8.4_

  - [x] 2.3 Create `frontend/src/components/SentryErrorBoundary.tsx`
    - Wrap Sentry's `ErrorBoundary` component from `@sentry/react`
    - Accept `children` prop and render a fallback UI on error
    - _Requirements: 1.3_

  - [x] 2.4 Integrate Sentry into `frontend/src/main.tsx`
    - Import and call `initSentry()` before `createRoot`/`render`
    - Wrap the app root with `SentryErrorBoundary`
    - _Requirements: 1.1, 1.3_

  - [x] 2.5 Add `VITE_SENTRY_DSN` type declaration to `frontend/src/vite-env.d.ts`
    - Add `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, and `VITE_SENTRY_RELEASE` to the `ImportMetaEnv` interface
    - _Requirements: 1.5, 7.3_

- [x] 3. Install dependencies and create stem service Sentry module
  - [x] 3.1 Add sentry-sdk[fastapi] to stem service dependencies
    - Add `sentry-sdk[fastapi]` to the stem service requirements/dependencies file
    - _Requirements: 5.1, 6.1_

  - [x] 3.2 Create `stem_service/sentry_init.py` module
    - Implement `init_sentry()` function that reads `SENTRY_DSN` from `os.environ`
    - If DSN is empty/None, skip initialization (log and return)
    - Configure: `traces_sample_rate: 0.3`, `send_default_pii: False`, `environment` from `SENTRY_ENVIRONMENT` or "production", `release` from `SENTRY_RELEASE`
    - Enable FastAPI integration for automatic request tracing
    - Add `before_send` hook that strips `X-Stem-Service-Token` header from request data
    - Implement `job_span(job_id, operation, **tags)` context manager that creates a child span with job metadata (stem_count, quality_mode)
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 8.3_

  - [x] 3.3 Integrate Sentry into `stem_service/server.py`
    - Call `init_sentry()` at the start of the FastAPI lifespan function
    - _Requirements: 5.1, 5.2, 6.2, 6.5_

  - [x] 3.4 Add job spans to `stem_service/job_worker.py`
    - Wrap stem separation and expand logic in `job_span()` context manager
    - Pass job_id, operation type, stem_count, and quality_mode as span tags
    - _Requirements: 5.3, 6.3_

- [x] 4. Checkpoint - Verify core integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Configure source map uploads and distributed tracing
  - [x] 5.1 Add @sentry/vite-plugin to `frontend/vite.config.ts`
    - Import and add `sentryVitePlugin` to the plugins array (production builds only)
    - Configure: org from `SENTRY_ORG`, project from `SENTRY_PROJECT`, authToken from `SENTRY_AUTH_TOKEN`
    - Enable source map generation for production builds (override current `sourcemap: false`)
    - Configure plugin to delete `.map` files after upload so they are never served
    - _Requirements: 1.6_

  - [x] 5.2 Ensure distributed tracing from backend to stem service
    - Verify that `@sentry/node` automatically propagates `sentry-trace` and `baggage` headers on outbound HTTP requests to the stem service
    - If not automatic, add trace header propagation to the backend's HTTP client calls to stem service
    - _Requirements: 4.4, 6.5_

- [x] 6. Update Docker and environment configuration
  - [x] 6.1 Update `docker-compose.yml` with Sentry environment variables
    - Add `SENTRY_DSN: ${SENTRY_DSN:-}` to backend service environment
    - Add `SENTRY_RELEASE: ${SENTRY_RELEASE:-}` to backend service environment
    - Add `SENTRY_DSN: ${SENTRY_DSN_STEM:-}` to stem_service environment
    - Add `SENTRY_RELEASE: ${SENTRY_RELEASE:-}` to stem_service environment
    - Add `SENTRY_ENVIRONMENT: ${SENTRY_ENVIRONMENT:-production}` to stem_service environment
    - Add `VITE_SENTRY_DSN: ${VITE_SENTRY_DSN:-}` to frontend build args
    - Add `VITE_SENTRY_ENVIRONMENT: ${VITE_SENTRY_ENVIRONMENT:-production}` to frontend build args
    - Add `VITE_SENTRY_RELEASE: ${VITE_SENTRY_RELEASE:-}` to frontend build args
    - Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` to frontend build args (for source map upload)
    - _Requirements: 7.4, 7.5_

  - [x] 6.2 Update `.env.example` files with Sentry placeholders
    - Add Sentry variables to root `.env.example` with documentation comments
    - Add Sentry variables to `backend/.env.example`
    - Add Sentry variables to `frontend/.env.example` if it exists, or document in root
    - _Requirements: 7.6_

- [x] 7. Checkpoint - Verify configuration and build
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Write property-based tests for data filtering
  - [ ]* 8.1 Write property test for backend sensitive header filtering
    - **Property 1: Backend sensitive header filtering**
    - **Validates: Requirements 3.6, 8.1**
    - Use `fast-check` to generate arbitrary header maps containing zero or more of Authorization, Cookie, x-api-key mixed with random non-sensitive headers
    - Assert: sensitive headers are always stripped, all non-sensitive headers remain intact
    - Minimum 100 iterations

  - [ ]* 8.2 Write property test for stem service sensitive header filtering
    - **Property 2: Stem service sensitive header filtering**
    - **Validates: Requirements 8.3**
    - Use `hypothesis` to generate arbitrary header maps containing zero or more instances of X-Stem-Service-Token mixed with random headers
    - Assert: X-Stem-Service-Token is always stripped, all other headers remain intact
    - Minimum 100 iterations

  - [ ]* 8.3 Write property test for frontend breadcrumb data filtering
    - **Property 3: Frontend breadcrumb data filtering**
    - **Validates: Requirements 8.4**
    - Use `fast-check` to generate breadcrumb objects with URLs/bodies containing Clerk session token patterns and Stripe key patterns mixed with normal data
    - Assert: sensitive values are redacted, breadcrumb category/type/non-sensitive data remain unchanged
    - Minimum 100 iterations

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each service gracefully degrades when no DSN is configured — no code paths change behavior
- Separate DSNs per service allow independent rate limits and alert rules in Sentry
- Source map upload requires `SENTRY_AUTH_TOKEN` at build time (CI/Docker build)
- Property tests use `fast-check` for JavaScript/TypeScript and `hypothesis` for Python
- Distributed tracing connects backend → stem service via `sentry-trace` and `baggage` headers
