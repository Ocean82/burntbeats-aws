# Remaining Work Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all **remaining, non-deferred** items from SRE, frontend architecture, beat-maker ops, and observability plans in one dependency-ordered execution wave.

**Architecture:** Execute in five waves — (1) doc truth + API client adoption, (2) UI state consistency, (3) contract/security hardening, (4) tracing + polish audits, (5) ops verification + plan close-out. Each wave is independently testable. Intentionally **excluded**: Beat Maker ML model, WAV sample kits, feature-folder refactor (YAGNI), production AWS Loki deployment (document only).

**Tech Stack:** Express, FastAPI (stem/speech/midi), React 19 + Vitest + Playwright, Prometheus/Grafana/Loki compose, PostgreSQL migrations, Sentry.

**Sources consolidated:** `docs/SRE-IMPROVEMENT-PLAN.md`, `docs/beat_maker_implementation_plan.md` (ops only), `docs/superpowers/plans/2026-06-03-frontend-architecture-refactor.md` (partial items), Cursor plan audit (July 2026).

---

## PRE-BUILD REALITY CHECK

```text
✅ Goal:
Finish partial SRE + frontend polish + beat-maker ops verification; no duplicate work on completed plans.

✅ Proposed approach:
Wave-based execution with verification gates after each wave; migrate raw `fetch` to `api/client.ts`; adopt shared UI primitives on high-traffic pages.

✅ Feasibility:
Feasible — core primitives exist (`client.ts`, `ErrorState`, `EmptyState`, `Skeleton`, Loki overlay, rotation runbook, beat-patterns API).

✅ Requirements:
Node 20+, Vitest, Playwright, backend `node --test`, stem/midi pytest slices, Docker for observability smoke, DB access for migration 005 in staging.

⚠️ Risks:
- API client migration can break upload/auth flows if FormData paths mishandled.
- UI adoption touches many files — batch by page to avoid mega-PR.
- Migration 005 is schema change — staging first, never prod without backup.

❌ Problems with doing everything at once:
Single giant PR is hard to review. Use waves with checkpoints.

🔄 Better alternatives:
- Wave 1–3 only (API + UI + contracts) if time-boxed.
- Defer mobile/typography audit to follow-up if blocked on design tokens.

✅ Recommendation:
Execute Waves 1–5 in order; stop after each wave’s verification gate.

FINAL STATUS:
SAFE TO PROCEED
```

---

## File map (what changes where)

| Area | Create | Modify |
|------|--------|--------|
| API adoption | `frontend/src/api/client.test.ts` (extend) | Hooks: `useSubscription`, `useUsageBalance`, `useMidiConvert`, `usePatternStorage`, `useMidiHistory`, `useMidiCatalog`, `useMidiRender`; `api/midiRhythm.ts`, `api/stems.ts`, `api/midiSoundfonts.ts`, `api/speech.ts`, `api/midiSource.ts` |
| UI consistency | — | `pages/SpeechCleanPage.tsx`, `pages/TunerPage.tsx`, `pages/MidiConvertPage.tsx`, `components/MyStemsPage.tsx`, `components/library/MidiCatalogPanel.tsx`, `components/PricingPage.tsx` |
| Contracts | `backend/tests/contract-health.test.mjs`, `backend/tests/contract-stem-status.test.mjs` | `shared/types/index.ts`, `scripts/ci-preflight.mjs` |
| Tracing | `frontend/src/lib/sentry.test.ts` | `frontend/src/lib/sentry.ts`, `frontend/src/api/client.ts` (propagate trace headers) |
| Health secrets | — | `backend/routes/health.js` |
| Ops | `docs/operations/DEPLOY-OBSERVABILITY.md`, `docs/operations/BEAT-MAKER-OPS.md` | `docs/SRE-IMPROVEMENT-PLAN.md`, `docs/beat_maker_implementation_plan.md` |
| E2E | `frontend/e2e/ui-state-consistency.spec.ts` (smoke) | `frontend/e2e/beat-piano-roll-bridge.spec.ts` (harden selectors) |

---

## Wave 1 — API client adoption (SRE §4.2)

**Current state:** `frontend/src/api/client.ts` exists and is used by `operations.ts`, `legal.ts`, `preview.ts`, `master.ts` — but **~27 files** still call raw `fetch`.

### Task 1: Inventory and gate raw fetch

**Files:**
- Modify: `scripts/ci-preflight.mjs`
- Test: run preflight

- [ ] **Step 1: Add grep gate**

Add to `scripts/ci-preflight.mjs` a check that fails if new raw `fetch(`${API_BASE}`)` appears in `frontend/src/hooks/` (allowlist existing files until migrated):

```javascript
// After existing checks — warn-only first, flip to fail in Task 6
const { execSync } = await import("node:child_process");
const hookFetch = execSync(
  'rg "fetch\\(` frontend/src/hooks --glob "*.ts" --glob "*.tsx" -l || true',
  { encoding: "utf8" },
).trim();
if (hookFetch) {
  console.warn("[preflight] hooks still using raw fetch:", hookFetch.split("\n").filter(Boolean).length, "files");
}
```

- [ ] **Step 2: Run preflight**

Run: `node scripts/ci-preflight.mjs`  
Expected: PASS with warn listing hook files

---

### Task 2: Migrate billing hooks

**Files:**
- Modify: `frontend/src/hooks/useSubscription.ts`, `frontend/src/hooks/useUsageBalance.ts`
- Test: existing billing tests if any; `npm test -- --run src/hooks/useSubscription.test.ts` (create if missing)

- [ ] **Step 1: Replace fetch in useUsageBalance**

```typescript
import { apiGet } from "../api/client";

// Replace fetch block with:
const result = await apiGet<{ balance: number }>("/api/billing/usage", {
  cacheKey: "billing-usage",
  cacheTtlMs: 15_000,
});
if (result.error || !result.data) {
  setError(result.error ?? "Failed to load usage");
  return;
}
setBalance(result.data.balance);
```

- [ ] **Step 2: Replace fetch in useSubscription** (checkout, portal, subscription GET) using `apiGet` / `apiPost`.

- [ ] **Step 3: Run tests**

Run: `cd frontend && npm test -- --run src/hooks/useUsageBalance.test.ts 2>&1 || npm run typecheck`  
Expected: typecheck PASS

---

### Task 3: Migrate MIDI + beat-pattern hooks

**Files:**
- Modify: `frontend/src/hooks/useMidiConvert.ts`, `frontend/src/hooks/useMidiHistory.ts`, `frontend/src/hooks/useMidiCatalog.ts`, `frontend/src/hooks/useMidiRender.ts`, `frontend/src/hooks/usePatternStorage.ts`
- Modify: `frontend/src/api/midiRhythm.ts`, `frontend/src/api/midiSoundfonts.ts`

- [ ] **Step 1: usePatternStorage** — use `apiGet`, `apiPost`, `apiDelete` helpers (add `apiDelete` to `client.ts` if absent):

```typescript
export async function apiDelete(path: string, options?: ApiRequestOptions): Promise<ApiResponse<void>> {
  return apiRequest<void>(path, { ...options, method: "DELETE" });
}
```

- [ ] **Step 2: useMidiConvert** — convert status polling paths to `apiGet`; keep `apiPostForm` for `/api/midi/convert` uploads.

- [ ] **Step 3: Run targeted tests**

Run: `cd frontend && npm test -- --run src/hooks/useBeatMaker.test.ts src/api/midiRhythm.resilient.test.ts`  
Expected: PASS

---

### Task 4: Migrate remaining api/* modules

**Files:**
- Modify: `frontend/src/api/stems.ts`, `frontend/src/api/speech.ts`, `frontend/src/api/midiSource.ts`, `frontend/src/api/operations.ts` (remaining raw fetch)

- [ ] **Step 1: stems.ts blob downloads** — use `apiRequest` with `responseType: 'blob'` or keep raw fetch for binary with comment `// binary download — intentional bypass` (document exception in client.ts header).

- [ ] **Step 2: Export client from barrel**

Modify `frontend/src/api/index.ts`:

```typescript
export { apiGet, apiPost, apiPostForm, apiDelete } from "./client";
export type { ApiResponse, ApiRequestOptions } from "./client";
```

- [ ] **Step 3: Flip preflight gate to fail** on hook raw fetch (Task 1 warn → error).

**Wave 1 gate:**

```bash
cd frontend && npm run typecheck && npm test -- --run src/api/retry.test.ts
node scripts/ci-preflight.mjs
```

---

## Wave 2 — UI state consistency (SRE §3.1–3.3)

### Task 5: Page-level loading + error + empty adoption

**Target pages (audit confirmed gaps):**

| Page | Loading | Error | Empty |
|------|---------|-------|-------|
| `SpeechCleanPage.tsx` | add `Skeleton` panel | wire `ErrorState` from hook error | no jobs CTA |
| `TunerPage.tsx` | skeleton for meter | `ErrorState` on mic denied | idle CTA |
| `MyStemsPage.tsx` |已有 skeleton | ensure `ErrorState` on fetch fail | use `EmptyState` |
| `MidiCatalogPanel.tsx` | skeleton grid | `ErrorState` on catalog fail | `EmptyState` no results |
| `PricingPage.tsx` | skeleton while subscription loads | `ErrorState` billing error | — |

**Files:**
- Modify: pages above
- Create: `frontend/src/components/ui/page-states.test.tsx` (smoke render)

- [ ] **Step 1: MyStemsPage empty/error**

```tsx
import { EmptyState } from "../components/ui/empty-state";
import { ErrorState } from "../components/ui/error-state";

if (error) {
  return <ErrorState variant="server" title="Could not load stems" description={error} onRetry={retryLoadStems} />;
}
if (!loading && items.length === 0) {
  return (
    <EmptyState
      title="No stems yet"
      description="Upload a track and split it to see your library here."
      action={{ label: "Open editor", onClick: () => onNavigate?.("editor") }}
    />
  );
}
```

- [ ] **Step 2: Repeat pattern for SpeechClean, Tuner, MidiCatalog** (match existing `MidiConvertPanel` ErrorState wiring).

- [ ] **Step 3: Component smoke test**

```tsx
// frontend/src/components/ui/page-states.test.tsx
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";
it("renders empty state action", () => {
  render(<EmptyState title="Test" description="Desc" action={{ label: "Go", onClick: () => {} }} />);
  expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
});
```

Run: `cd frontend && npm test -- --run src/components/ui/page-states.test.tsx`

**Wave 2 gate:**

```bash
cd frontend && npm test -- --run src/components/ui/
npx playwright test e2e/ui-state-consistency.spec.ts --project=chromium
```

---

## Wave 3 — Contracts + security (SRE §4.3, §6.1)

### Task 6: Health + job status contract tests

**Files:**
- Create: `backend/tests/contract-health.test.mjs`
- Create: `backend/tests/contract-stem-status.test.mjs`
- Modify: `scripts/ci-preflight.mjs` (add contract tests)

- [ ] **Step 1: Health shape test**

```javascript
test("GET /api/health returns required fields", async () => {
  const res = await request.get("/api/health").expect(200);
  assert.ok("status" in res.body);
  assert.ok("uptime_seconds" in res.body);
  assert.ok("database" in res.body);
  assert.ok("services" in res.body || "stem_service" in res.body);
});
```

- [ ] **Step 2: Stem status shape** (mock stem service or use test stub from `midi-auth.test.mjs` pattern).

- [ ] **Step 3: Add to ci-preflight**

Run: `node --test backend/tests/contract-health.test.mjs`

---

### Task 7: Secret presence in health (degraded mode)

**Files:**
- Modify: `backend/routes/health.js`

- [ ] **Step 1: Add secrets block**

```javascript
const secrets = {
  clerk: Boolean(process.env.CLERK_SECRET_KEY),
  job_token: Boolean(process.env.JOB_TOKEN_SECRET),
  stripe: Boolean(process.env.STRIPE_SECRET_KEY),
};
const secretsOk = secrets.clerk && secrets.job_token;
// Include in payload; if !secretsOk && NODE_ENV === 'production', set status degraded
```

- [ ] **Step 2: Extend contract test** to expect `secrets` object when `NODE_ENV=test`.

---

### Task 8: Verify merge rate limit (SRE §6.1 — likely done)

**Files:**
- Test: `backend/routes/midi/__tests__/merge.rate-limit.test.mjs`

- [ ] **Step 1: Run existing test**

Run: `cd backend && node --test routes/midi/__tests__/merge.rate-limit.test.mjs`  
Expected: PASS — if PASS, mark SRE §6.1 merge item **Done** in checklist; only document any gap found.

**Wave 3 gate:**

```bash
cd backend && node --test tests/contract-health.test.mjs routes/midi/__tests__/merge.rate-limit.test.mjs
```

---

## Wave 4 — Tracing + UX polish (SRE §1.4, §3.4–3.6)

### Task 9: End-to-end Sentry trace propagation

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/lib/sentry.ts`
- Create: `frontend/src/lib/sentry.test.ts`

- [ ] **Step 1: Propagate trace headers in client**

```typescript
import * as Sentry from "@sentry/react";

function traceHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const span = Sentry.getActiveSpan();
  if (!span) return headers;
  const trace = Sentry.spanToTraceHeader(span);
  const baggage = Sentry.getBaggage?.();
  if (trace) headers["sentry-trace"] = trace;
  if (baggage) headers["baggage"] = baggage;
  return headers;
}
// Merge into apiRequest header builder alongside authHeaders()
```

- [ ] **Step 2: Unit test trace header merge** (mock Sentry span).

- [ ] **Step 3: Document** in `docs/operations/DEPLOY-OBSERVABILITY.md` how to verify spans in Sentry (frontend fetch → backend → python).

---

### Task 10: Micro-interaction + reduced-motion audit

**Files:**
- Modify: high-traffic CTAs missing `active:scale-[0.97]`: grep `fire-button` pattern, apply to primary `midi-btn` clusters in `DrumMachinePanel`, `MidiConvertPanel`, split CTA
- Verify: `prefers-reduced-motion` disables `beat-playhead-pulse`, Framer Motion panels

- [ ] **Step 1: Grep and patch**

Run: `rg "className=.*midi-btn" frontend/src/components --glob "*.tsx" | head`  
Add `active:scale-[0.97] transition-transform` where missing on primary actions only (not every button).

- [ ] **Step 2: Manual spot-check** split complete → success flash still visible (`SuccessFlash` in MidiConvertPanel).

---

### Task 11: Mobile + typography spot fixes (not full redesign)

**Scope:** Fix known issues only — no token rewrite.

- [ ] **Step 1: 375px audit checklist** (manual + Playwright viewport)
  - Mixer sliders: min height 44px (`min-h-11` on range inputs in mixer)
  - Modals: `max-h-[90vh] overflow-y-auto` on `ExportOptionsModal`, `MidiProcessDialog`
  - Beats grid: horizontal scroll already present — verify no double overflow

- [ ] **Step 2: Typography** — replace ad-hoc `text-[10px]` labels in 3 worst panels with `text-meta` / `text-helper` from design tokens (`midi-tokens.css`).

**Wave 4 gate:** manual QA script in `docs/operations/DEPLOY-OBSERVABILITY.md` + `npm run typecheck`

---

## Wave 5 — Ops verification + plan close-out

### Task 12: Beat maker ops

**Files:**
- Create: `docs/operations/BEAT-MAKER-OPS.md`

- [ ] **Step 1: Document migration 005**

```bash
cd backend && npm run db:migrate   # applies 005_user_beat_patterns.sql
```

- [ ] **Step 2: Run verification suite from beat maker plan §10**

```bash
cd frontend && npm test -- --run src/hooks/useBeatMaker.test.ts src/audio/beatPatternExport.test.ts
cd backend && node --test tests/beat-patterns.test.mjs routes/midi/__tests__/rhythm.proxy.test.mjs
cd frontend && npx playwright test e2e/beat-piano-roll-bridge.spec.ts e2e/midi-groove-insert.spec.ts
```

- [ ] **Step 3: Manual QA script** (Premium sync, piano-roll handoff) — copy from `docs/beat_maker_implementation_plan.md` §10 into BEAT-MAKER-OPS.md

---

### Task 13: Observability ops doc (production Loki = document, not deploy)

**Files:**
- Create: `docs/operations/DEPLOY-OBSERVABILITY.md`

Content:
- Local: 3-file compose command (already in SRE plan)
- Production options: CloudWatch Logs vs Grafana Cloud Loki vs self-hosted — decision matrix
- Alert routing: reference `monitoring/alerts/burntbeats.yml`
- Secret rotation: link `docs/operations/SECRET-ROTATION-RUNBOOK.md`

---

### Task 14: Update master checklists

**Files:**
- Modify: `docs/SRE-IMPROVEMENT-PLAN.md` — flip rows to Done/Partial with dates as waves complete
- Modify: `docs/SRE-IMPROVEMENT-PLAN.md` §4.2 note: `client.ts` exists; track **adoption %** not file existence
- Add: `docs/plans/STATUS.md` — single index pointing to this plan + deferred backlog

**Deferred (do not implement in this plan):**

| Item | Reason |
|------|--------|
| Beat Maker ML (LSTM) | Explicitly deferred in beat maker plan §11 |
| WAV sample kits | CDN/storage decision pending |
| `/beat-maker` standalone route | Optional; embedded in Library |
| Feature folders refactor | YAGNI per frontend architecture plan |
| Production Loki deploy | Infra decision — document only in Task 13 |
| Blue/green canary workflow | Ops process — document deployment order in DEPLOY-OBSERVABILITY.md |

---

## Full verification matrix (final gate)

```bash
# Frontend
cd frontend && npm run typecheck
cd frontend && npm test -- --run

# Backend
cd backend && node --test tests/contract-health.test.mjs tests/beat-patterns.test.mjs
cd backend && node --test routes/midi/__tests__/rhythm.proxy.test.mjs routes/midi/__tests__/merge.rate-limit.test.mjs

# Preflight
node scripts/ci-preflight.mjs

# E2E (subset)
cd frontend && npx playwright test e2e/beat-piano-roll-bridge.spec.ts e2e/ui-state-consistency.spec.ts

# Observability smoke (optional, Docker required)
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.observability.yml up -d
curl -s http://localhost:9090/-/healthy
curl -s http://localhost:3100/ready
```

---

## Self-review (spec coverage)

| Source requirement | Task |
|--------------------|------|
| SRE §4.2 API client | Tasks 1–4 |
| SRE §3.1–3.3 UI states | Task 5 |
| SRE §4.3 contracts | Task 6 |
| SRE §6.2 health secrets | Task 7 |
| SRE §6.1 merge limit | Task 8 |
| SRE §1.4 tracing | Task 9 |
| SRE §3.4–3.6 polish | Tasks 10–11 |
| Beat maker §10 verification | Task 12 |
| SRE §5.4 prod observability | Task 13 |
| Plan doc accuracy | Task 14 |

No TBD placeholders. Binary download fetch exception documented in Task 4.

---

## Execution handoff

**Plan saved to:** `docs/superpowers/plans/2026-07-04-remaining-work-consolidation.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per wave, review at each gate  
2. **Inline Execution** — implement waves 1→5 in this session with checkpoints

**Which approach?**
