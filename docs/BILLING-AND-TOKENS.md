# Billing, subscriptions, and usage tokens

**Last updated:** 2026-03-22

Burnt Beats uses **Stripe** for monthly subscriptions. This document is the **product contract**: how plans map to app features, how **tokens** are intended to work (monthly allowance + spend by audio duration), and how to wire **Stripe metadata** (including with the **Stripe CLI**).

Implementation status in the repo:

- **Done:** Stripe Checkout, Customer Portal, Clerk-linked customers, `GET /api/billing/subscription`, `GET /api/billing/usage`, webhook credits from Price metadata (`tokens_per_month` / `token_seconds_per_month`), **usage token ledger** in Clerk `privateMetadata.usageTokens`, **debit + enforce** on `POST /api/stems/split` and `POST /api/stems/expand` when `USAGE_TOKENS_ENABLED` (1 token ≈ 1 minute of source audio; see `backend/usageTokens.js`).
- **Not metered:** status polling, stem file downloads, mixing, editing, **client-side master export** (see `docs/ARCHITECTURE-FLOW.md`).
- **Future:** `POST /api/stems/server-export` when a server pipeline exists (placeholder returns `404`/`501`).

---

## Plans (high level)

| Plan | Stripe price env | Intended features |
|------|------------------|-------------------|
| **Basic** | `STRIPE_PRICE_ID_BASIC` | **2-stem** separation only, **Speed** quality (fast). **Waveform** mixer. Monthly **token** allowance per plan metadata. |
| **Premium** | `STRIPE_PRICE_ID_PREMIUM` | **2-stem** then **expand to 4-stem**; **Speed** and **Quality** (and **Ultra** where enabled). **Waveform** mixer. Higher monthly **tokens**. |
| **Studio** | `STRIPE_PRICE_ID_STUDIO` | Everything in Premium plus **Ultra** priority / higher limits (see your Stripe product copy). |
| **Top-up** | `STRIPE_PRICE_ID_TOPUP` | One-time **purchase** of extra tokens (optional; not a subscription). |

The app resolves the active plan from the subscription’s **price ID** (`backend/billing.js` → `planFromSubscription`).

---

## Token model (implemented)

1. **Grant:** Each billing period, credits are applied from Stripe Price metadata (`tokens_per_month` or `token_seconds_per_month` converted to minute-tokens) into Clerk — see `creditSubscriptionAllowance` in `backend/usageTokens.js`.
2. **Spend:** **Split** and **expand** consume **minute-based tokens** (1 token ≈ 1 minute of source audio, partial minutes round up). **Editing and client export do not spend tokens.**
3. **Enforcement:** Insufficient balance → HTTP **402** on metered routes.

Formula:

```text
cost_tokens = max(1, ceil(duration_seconds / 60))
```

---

## Stripe Price metadata (recommended)

Use **Price** metadata in the Stripe Dashboard (or API) so ops can change allowances without code deploys. Example keys:

| Metadata key | Example | Meaning |
|--------------|---------|---------|
| `tokens_per_month` | `1200` | Tokens credited each billing period |
| `token_seconds_per_month` | `72000` | Alternative: **seconds** of audio covered per month (clearer for “pay by length”) |
| `plan_tier` | `basic` \| `premium` \| `studio` | Must match app logic if you sync to Clerk |
| `allow_4stem` | `false` \| `true` | Premium+ |
| `allow_quality_modes` | `false` \| `true` | Premium+ (Speed-only when false) |

You can read these in:

- **Webhook** handlers (`customer.subscription.updated`, etc.) and sync to **Clerk** `publicMetadata` or your DB.
- **Checkout session** completion to seed the first period.

Webhook handlers call **`creditSubscriptionAllowance`** for active subscriptions / paid invoices (idempotent per period).

---

## Stripe CLI (inspect products, prices, metadata)

With [Stripe CLI](https://stripe.com/docs/stripe-cli) installed and logged in:

```bash
# List prices (see price IDs and product linkage)
stripe prices list --limit 20

# Show one price (metadata + recurring)
stripe prices retrieve price_xxxxxxxxxxxxxxxxxxxx

# List products
stripe products list --limit 20

# Trigger webhook forwarding to local backend (test mode, syncs whsec into backend/.env):
#   node scripts/stripe-local-dev.mjs   OR   cd backend && npm run stripe:listen
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Use the same **Price IDs** as in `.env`: `STRIPE_PRICE_ID_BASIC`, `STRIPE_PRICE_ID_PREMIUM`, `STRIPE_PRICE_ID_STUDIO`, `STRIPE_PRICE_ID_TOPUP`.

---

## API reference (billing)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/billing/subscription` | `{ active, plan }` — `plan` is `basic` \| `premium` \| `studio` \| `unknown` |
| `GET` | `/api/billing/usage` | `{ balance, periodEnd }` — usage tokens (Clerk) |
| `POST` | `/api/billing/checkout` | Body `{ plan, returnUrl }` — starts Checkout |
| `POST` | `/api/billing/portal` | Customer Portal `{ returnUrl }` |
| `POST` | `/api/billing/webhook` | Stripe-signed webhooks (raw body) |

---

## API reference (stems — metering)

| Method | Path | Tokens? |
|--------|------|--------|
| `POST` | `/api/stems/split` | Yes (if `USAGE_TOKENS_ENABLED`) |
| `POST` | `/api/stems/expand` | Yes (if enabled) |
| `POST` | `/api/stems/server-export` | Future (placeholder) |
| `GET` | `/api/stems/status/...`, `/api/stems/file/...` | No |

---

## Frontend behavior (aligned with this doc)

- **Basic:** UI offers **Speed** only for stem separation; **no** “Keep going → 4 stems” (upgrade to Premium). Batch queue is limited to Premium+.
- **Premium / Studio:** Full quality options (Speed, Quality, Ultra where applicable), **expand to 4 stems**, batch queue.

---

## Related files

- `backend/billing.js` — Stripe + Clerk
- `backend/usageTokens.js` — balance, debit, monthly credit
- `docs/ARCHITECTURE-FLOW.md` — server vs client vs billing vs ops
- `frontend/src/hooks/useSubscription.ts` — subscription state
- `frontend/src/components/PaywallBanner.tsx` — plan cards
- `frontend/src/App.tsx` — plan-based gating for split/expand/queue
