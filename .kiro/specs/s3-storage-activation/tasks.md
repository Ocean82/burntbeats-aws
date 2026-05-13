# Implementation Plan: S3 Storage Activation

## Overview

This plan activates the existing S3 storage pipeline end-to-end and builds the new "My Stems" page for browsing/re-downloading previously separated stems. Phases 1–3 are primarily verification and config fixes (most code already exists). Phase 7 is the bulk of new application code (backend route + frontend page).

## Tasks

- [x] 1. Phase 1 — Environment Configuration Fix
  - [x] 1.1 Fix duplicate S3_BUCKET and S3_PREFIX keys in docker-compose.yml backend environment section
    - Remove the second occurrence of `S3_BUCKET: ${S3_BUCKET:-}` and `S3_PREFIX: ${S3_PREFIX:-stems}` (lines ~97-98 in the backend environment block)
    - YAML maps with duplicate keys have undefined behavior; this fix ensures deterministic config
    - _Requirements: 1.2, 1.7_
  - [x] 1.2 Verify .env has correct S3 configuration values
    - Confirm root `.env` contains: `S3_ENABLED=true`, `S3_BUCKET=burntbeatz2-storage`, `S3_REGION=us-east-1`, `S3_PREFIX=stems`, `S3_DELETE_LOCAL_AFTER_UPLOAD=false`
    - Confirm `stem_service/.env` has `S3_ENABLED=true` (or relies on docker-compose interpolation)
    - Do NOT commit actual credentials — verify structure only
    - _Requirements: 1.1, 1.7_
  - [x] 1.3 Create credential verification script
    - Create `scripts/verify-s3-credentials.sh` that runs: `aws sts get-caller-identity`, `aws s3api head-bucket --bucket burntbeatz2-storage`, test PutObject/GetObject with a temp file, and `docker compose config | grep S3`
    - Script should exit non-zero on any failure with clear error messages
    - _Requirements: 1.4, 1.5, 1.6_

- [x] 2. Phase 2 — S3 Bucket CORS Configuration
  - [x] 2.1 Update scripts/s3-cors-config.json to match design requirements
    - Add `http://localhost:3000` to AllowedOrigins (for alternative local dev port)
    - Add `Authorization`, `Range`, `Content-Type` to AllowedHeaders (currently uses `*` which covers this, but be explicit per design)
    - Add `ETag` and `Content-Range` to ExposeHeaders (currently only exposes `Content-Length`, `Content-Type`)
    - Keep `MaxAgeSeconds: 3600`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 2.2 Create scripts/s3-cors-setup.sh to apply CORS configuration
    - Shell script that runs `aws s3api put-bucket-cors --bucket burntbeatz2-storage --cors-configuration file://scripts/s3-cors-config.json`
    - Include verification step: `aws s3api get-bucket-cors --bucket burntbeatz2-storage`
    - Include a preflight test with `curl -I -X OPTIONS` from production origin
    - Script must be idempotent (safe to re-run)
    - _Requirements: 2.6_

- [x] 3. Phase 3 — Database Schema Migration Verification
  - [x] 3.1 Verify migration 001_stems_unique_constraint.sql is correct and idempotent
    - Confirm the migration handles duplicate removal before adding constraint
    - Confirm `backend/db-migrate.js` will execute this migration
    - Note: The migration file already exists and is correctly written; this task verifies it runs cleanly
    - _Requirements: 3.1, 3.4, 3.5_
  - [x] 3.2 Verify insertStems() upsert logic handles S3 key updates
    - Confirm `backend/db-jobs.js` `insertStems()` uses `ON CONFLICT (job_id, stem_name) DO UPDATE SET s3_key = COALESCE(EXCLUDED.s3_key, stems.s3_key)`
    - Confirm graceful no-op when pool is unavailable
    - Note: Already implemented correctly; this task is verification only
    - _Requirements: 3.2, 3.6_
  - [x] 3.3 Verify status.js calls insertStems() on job completion with S3 keys
    - Confirm `backend/routes/stems/status.js` extracts `s3Meta.keys` from progress.json and passes to `insertStems()`
    - Note: Already implemented; verification only
    - _Requirements: 3.3_

- [x] 4. Checkpoint — Phases 1-3 verified
  - Ensure docker-compose.yml has no duplicate keys, CORS config is complete, migration is ready. Ask the user if questions arise.

- [x] 5. Phase 6 — S3 Lifecycle Policy
  - [x] 5.1 Create scripts/s3-lifecycle-policy.json
    - Define lifecycle rule: transition objects under `stems/` prefix to STANDARD_IA after 90 days
    - Do NOT include deletion rules (stems must remain accessible for re-download)
    - Include a comment/README noting this is applied via `aws s3api put-bucket-lifecycle-configuration`
    - _Requirements: 6.4_

- [x] 6. Phase 7 — Backend: Job History with Stems
  - [x] 6.1 Add getJobHistoryWithStems() function to backend/db-jobs.js
    - New function (does NOT modify existing `getJobHistory`) to avoid breaking existing callers
    - Query 1: `SELECT COUNT(*) FROM jobs WHERE clerk_user_id = $1 AND status = 'completed'`
    - Query 2: `SELECT j.*, json_agg(json_build_object('stem_name', s.stem_name, 's3_key', s.s3_key, 'file_size_bytes', s.file_size_bytes)) FILTER (WHERE s.id IS NOT NULL) AS stem_files FROM jobs j LEFT JOIN stems s ON s.job_id = j.job_id WHERE j.clerk_user_id = $1 AND j.status = 'completed' GROUP BY j.job_id ORDER BY j.created_at DESC LIMIT $2 OFFSET $3`
    - Returns `{ jobs: [...], total: number }`
    - Graceful no-op when pool is unavailable (return `{ jobs: [], total: 0 }`)
    - _Requirements: 7.8_
  - [x] 6.2 Create backend/routes/stems/history.js with GET /api/stems/history
    - Use `verifyClerkBearer(req)` for authentication (return 401 if unauthenticated)
    - Call `getJobHistoryWithStems(userId, { limit, offset })` with clamped params (limit max 200, offset min 0)
    - Validate `job_id` against UUID regex in download endpoint
    - Validate `stem_name` against allowed values (vocals, drums, bass, other, instrumental)
    - Return JSON `{ jobs: [...], total: number }`
    - _Requirements: 7.8, 7.9_
  - [x] 6.3 Add GET /api/stems/history/download endpoint in backend/routes/stems/history.js
    - Accept query params: `job_id` (UUID), `stem_name` (string)
    - Verify job belongs to authenticated user (`WHERE clerk_user_id = $userId AND job_id = $jobId`)
    - Look up `s3_key` from stems table for the given job_id + stem_name
    - If s3_key is null, return 404 `{ error: "Stem not found or not available for download" }`
    - Generate presigned URL via `presignStemGetUrl(bucket, key, region)` using env vars for bucket/region
    - Return `{ url: "<presigned_url>" }`
    - On presign failure, return 500 `{ error: "Failed to generate download URL" }`
    - _Requirements: 7.3, 7.10_
  - [x] 6.4 Register history route in backend/server.js
    - Import `{ stemHistoryRouter }` from `./routes/stems/history.js`
    - Mount at `/api/stems/history` (under the existing `/api/stems` prefix or as a standalone mount)
    - Ensure it does not conflict with the existing `/api/jobs/history` route in `routes/history.js`
    - _Requirements: 7.8_
  - [ ]* 6.5 Write property test: Upsert preserves latest S3 key (Property 1)
    - **Property 1: Upsert preserves latest S3 key**
    - **Validates: Requirements 3.2**
    - File: `backend/tests/db-jobs.property.test.mjs`
    - Use fast-check to generate random UUIDs, stem names, and s3_key strings
    - Assert: inserting with key_a then upserting with key_b results in stored key being key_b
  - [ ]* 6.6 Write property test: Presigned URL generation from stored key (Property 7)
    - **Property 7: Presigned URL generation from stored key**
    - **Validates: Requirements 6.6**
    - File: `backend/tests/s3-presign.property.test.mjs`
    - Use fast-check to generate random s3_key strings
    - Assert: presigned URL contains bucket name and s3_key path with valid expiration

- [x] 7. Checkpoint — Backend complete
  - Ensure all backend routes work, DB function returns correct data, presigned URLs generate. Ask the user if questions arise.

- [x] 8. Phase 7 — Frontend: API Client and Hook
  - [x] 8.1 Create frontend/src/api/stemHistory.ts API client
    - `fetchStemHistory(opts?: { limit?: number; offset?: number })`: calls `GET /api/stems/history` with auth headers, returns `{ jobs, total }`
    - `fetchStemDownloadUrl(jobId: string, stemName: string)`: calls `GET /api/stems/history/download?job_id=X&stem_name=Y` with auth headers, returns presigned URL string
    - Use `authHeaders()` from existing `./auth` module
    - Use `API_BASE` from `../config`
    - Handle HTTP errors with descriptive messages
    - _Requirements: 7.3, 7.8_
  - [x] 8.2 Create frontend/src/hooks/useStemHistory.ts hook
    - Fetch stem history on mount via `fetchStemHistory()`
    - Expose: `jobs`, `isLoading`, `error`, `totalJobs`, `totalStems`, `totalStorageBytes`, `refetch()`
    - Compute `totalStems` as sum of `stem_files.length` across all jobs
    - Compute `totalStorageBytes` as sum of all non-null `file_size_bytes` values
    - Handle loading, error, and empty states
    - _Requirements: 7.1, 7.5_
  - [ ]* 8.3 Write property test: Storage stats invariant (Property 4)
    - **Property 4: Storage stats invariant**
    - **Validates: Requirements 7.5**
    - File: `frontend/src/hooks/__tests__/useStemHistory.property.test.ts`
    - Use fast-check to generate random job/stem collections
    - Assert: total_stems equals sum of stem_files.length, total_storage equals sum of non-null file_size_bytes

- [x] 9. Phase 7 — Frontend: MyStemsPage Component
  - [x] 9.1 Create frontend/src/components/MyStemsPage.tsx
    - Storage Overview section: cards showing total jobs, total stems, approximate storage used (formatted as MB/GB)
    - Search input: filters job cards by `original_filename` (case-insensitive substring match)
    - Sort dropdown: date-desc (default), date-asc, name-asc, name-desc, stems-desc
    - Job Cards list: expandable cards with Framer Motion animations
    - Each card shows: original filename (or "Untitled"), date (relative or formatted), stem count badge, quality badge
    - Expanded card reveals: individual stem rows with stem name, file size, download button
    - Download button: calls `fetchStemDownloadUrl()` then triggers browser download
    - "Download All" button: fetches all presigned URLs, bundles into ZIP via JSZip, triggers download
    - On mobile: use sequential stem fetching for ZIP (same pattern as `useExport.ts`)
    - Disabled download state for stems with null `s3_key` (show "Unavailable" label)
    - Empty state: "No stems yet. Split your first track!" with CTA
    - Error state: retry button
    - Dark theme: `bg-[#1a1412]`, amber-500 accents, `rounded-3xl` cards, white text
    - Responsive: single-column on mobile, touch-friendly targets (min 44px)
    - Use Lucide React icons (Download, Music, Package, Search, ChevronDown, etc.)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.9, 7.11, 7.12_
  - [x] 9.2 Add "My Stems" navigation to App.tsx
    - Add `"my-stems"` to the `activeView` state type: `"editor" | "pricing" | "my-stems"`
    - Render `<MyStemsPage onClose={() => setActiveView("editor")} />` when `activeView === "my-stems"`
    - Pass `setActiveView` to `EditorHeader` so it can trigger navigation
    - _Requirements: 7.1_
  - [x] 9.3 Add "My Stems" button to EditorHeader component
    - Add a navigation button/link in `frontend/src/app/editor-header.component.tsx`
    - Use a Lucide icon (e.g., `Library` or `FolderOpen`) with "My Stems" label
    - Only show when user is authenticated (Clerk signed in)
    - Highlight when `activeView === "my-stems"`
    - _Requirements: 7.1_
  - [ ]* 9.4 Write property test: Search filter correctness (Property 5)
    - **Property 5: Search filter correctness**
    - **Validates: Requirements 7.6**
    - File: `frontend/src/components/__tests__/MyStemsPage.property.test.ts`
    - Use fast-check to generate random filenames and search queries
    - Assert: filtered result contains exactly those jobs whose original_filename contains query as case-insensitive substring
  - [ ]* 9.5 Write property test: Sort ordering correctness (Property 6)
    - **Property 6: Sort ordering correctness**
    - **Validates: Requirements 7.1, 7.7**
    - File: `frontend/src/components/__tests__/MyStemsPage.property.test.ts`
    - Use fast-check to generate random job collections and sort options
    - Assert: sorted result is totally ordered per comparator (date-desc, date-asc, name-asc, name-desc, stems-desc)
  - [ ]* 9.6 Write property test: ZIP bundle completeness (Property 3)
    - **Property 3: ZIP bundle completeness**
    - **Validates: Requirements 7.4**
    - File: `frontend/src/hooks/__tests__/useStemHistory.property.test.ts`
    - Use fast-check to generate random stem arrays
    - Assert: ZIP contains exactly one entry per stem in the set, no extras

- [x] 10. Final checkpoint — All phases complete
  - Ensure all tests pass, frontend renders correctly, backend endpoints return expected data. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Phases 4 and 5 (Integration Testing and Production Deployment) are excluded from this task list as they involve manual testing and deployment operations, not code generation
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The frontend uses the existing dark theme, Framer Motion, Lucide React, and JSZip — no new dependencies needed
- The backend history route is separate from the existing `/api/jobs/history` route (which returns jobs without stem metadata)
