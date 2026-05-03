# Root `legal/` folder

Markdown here is a **working / counsel-facing** stash (alternate formatting such as **`TERMS_OF_SERVICE.md`** with promotional styling).

## What users actually see

The production SPA loads:

- **`frontend/src/pages/legal/privacy-policy.md`**
- **`frontend/src/pages/legal/terms-of-service.md`**

via **`frontend/src/pages/LegalPage.tsx`** at **`/privacy-policy`** and **`/terms-of-service`**.

**Version IDs** enforced by **`LegalAcceptanceGate`** ↔ **`POST /api/legal/accept`** ↔ **`LEGAL_VERSIONS`** in **`frontend/src/legal/versions.ts`** (must match **`LEGAL_TOS_VERSION` / `LEGAL_PRIVACY_VERSION`** on the backend).

## Maintaining drafts

Before shipping policy changes:

1. Update SPA markdown under **`frontend/src/pages/legal/`** (canonical for end users).
2. Bump **`frontend/src/legal/versions.ts`** and backend legal env (**`docs/LEGAL-LAYOUT.md`**).
3. Optionally copy or reconcile into this **`legal/`** folder for your records.

**`./DMCA_POLICY.md`** here (plus other **`*.md`** in this folder) are attorney/source artifacts — cite or summarize in SPA legal pages **only after counsel review** (`docs/LEGAL-LAYOUT.md`).
