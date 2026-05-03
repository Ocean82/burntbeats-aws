# Legal documents — layout & compliance (technical)

**Not legal advice.** This file documents **where user-facing policies live**, how **versions** propagate, and crawler-facing URLs so you stay aligned with integrations (Stripe, Clerk, TikTok Login Kit expectations, GA4 property configuration, etc.).

---

## Canonical copy for the product (SPA)

| Document | Served at | Source file |
|----------|-----------|-------------|
| Privacy Policy | **`/privacy-policy`** | **`frontend/src/pages/legal/privacy-policy.md`** (imported as raw by **`LegalPage.tsx`**) |
| Terms of Service | **`/terms-of-service`** | **`frontend/src/pages/legal/terms-of-service.md`** |

Routes are wired in **`frontend/src/Root.tsx`** **before** Clerk gating → **reachable without signing in**.

**Footer / gate links:** **`LegalAcceptanceGate.tsx`**, **`LegalPage.tsx`**, **`LandingPage`** as applicable.

---

## Version strings (must stay in sync)

| Location | Purpose |
|----------|---------|
| **`frontend/src/legal/versions.ts`** | Source of truth for **`LEGAL_VERSIONS.tos`** / **`.privacy`**. Frontend posts these to **`POST /api/legal/accept`**. |
| **`backend/server.js`** **`LEGAL_TOS_VERSION`**, **`LEGAL_PRIVACY_VERSION`** | Defaults must match **`versions.ts`**; production can override via env. |
| **User metadata** **`publicMetadata.legalAccepted`** | Persists **`tosVersion`**, **`privacyVersion`**, **`acceptedAt`**. |

If you revise markdown content meaningfully: bump **`LEGAL_VERSIONS`**, **`LEGAL_*_VERSION`** (env or server defaults), and consider whether existing users must re-accept (**`LegalAcceptanceGate`** compares versions).

Repo root **`legal/*.md`** (emoji / alternate drafts) — **secondary** archive; align with counsel then **mirror** substantive changes into **`frontend/src/pages/legal/`** — do not rely on **`legal/`** for what users see unless you symlink/build-step (currently there is none).

---

## Discoverability / SEO tooling

| Asset | Purpose |
|-------|---------|
| **`frontend/public/sitemap.xml`** | Lists **`/privacy-policy`**, **`/terms-of-service`** (apex + **`www`** where configured). Submit in Search Console. |
| **`frontend/public/robots.txt`** | **`Allow: /`** + sitemap hint. |

---

## Operational checklist when updating policies

1. Edit **`frontend/src/pages/legal/*.md`**.
2. Update **`LEGAL_VERSIONS`** + backend **`LEGAL_*`** env (or defaults).
3. Optionally sync **`legal/*.md`** for your records/counsel.
4. **`npm run build`** (Compose: rebuild **`frontend`** image).
5. Re-verify **`/privacy-policy`**, **`/terms-of-service`** live (and E2E **`e2e/legal-public.spec.ts`** in CI).

---

## Related docs

| File | Notes |
|------|-------|
| [`../legal/README.md`](../legal/README.md) | Root **`legal/`** folder rationale |
| [`PRODUCTION-READINESS-CHECKLIST.md`](PRODUCTION-READINESS-CHECKLIST.md) | Env + Stripe/Clerk alignment |
