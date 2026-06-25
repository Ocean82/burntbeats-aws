# Burnt Beats Conversion Overhaul — Design Spec

> **For agents:** This spec describes 7 coordinated changes to improve free-to-paid conversion. Each section is independently implementable but sequenced for impact. After writing the implementation plan, use subagent-driven-development to execute it.

**Goal:** Increase the % of new sign-ups who convert to a paid subscription within their first session.

**Current funnel:** Sign up (free) → Legal gate → Stem Editor → Split tracks → Export → (eventually hit token limit) → UpsellModal

**Target funnel:** Sign up → Legal gate → **Plan picker** → **Pricing visible** → Stem Editor → **Success upsell** → **Token awareness** → Export → Upgrade

---

## 1. Post-Sign-Up Plan Picker

### Behavior

A full-screen `/select-plan` route shown to first-time authenticated users before they enter the editor. Visible only once — after dismissal or plan selection, a `planPickerSeen: true` flag in Clerk `publicMetadata` suppresses it permanently.

### Placement in component tree

```
SignedInAppTree (Root.tsx)
  └── LegalAcceptanceGate
       └── PlanPickerPage (NEW — shown if user.publicMetadata.planPickerSeen !== true)
            ├── [selects plan] → Stripe Checkout redirect
            └── [Continue with Free] → marks planPickerSeen=true → renders children (editor)
```

The plan picker wraps the existing editor tree (`WorkflowProvider → StemMediaProvider → AudioProvider → AppShell → App`). If `planPickerSeen` is true, it passes straight through (like LegalAcceptanceGate does today).

### UI Components

**PlanPickerCard** — Reuses the same plan data from `data/plans.ts`. Each card:
- Plan name, description, price label (monthly/yearly toggle at top)
- Key feature bullets (2-3 per plan)
- "Start Premium" / "Choose Basic" fire-button CTA
- Free card: "5 free minutes/month" — CTA: "Continue with Free" (secondary style)

**PlanPickerPage** — Full-screen layout:
- Dark forge background with fire orbs (matching LegalAcceptanceGate aesthetic)
- Centered card grid: 3 subscription plans (Free, Basic, Premium) on desktop, stacked on mobile
- Monthly/yearly toggle at top
- Below the grid: "One-time packs available" link → shows Single/TopUp as collapsible section
- Bottom: "Continue with Free" as small underlined link

### Post-Sign-Up Routing

- `usePostSignupPlanCheckout.ts` already stores a plan in `sessionStorage` if user clicked a pricing CTA before signing up. Keep this flow but redirect through PlanPickerPage first (pre-selecting the plan they chose).
- If user signed up via a generic CTA (hero, header), show PlanPickerPage with no pre-selection.
- After plan selection → Stripe Checkout. After checkout return → mark `planPickerSeen=true` → enter editor.
- On "Continue with Free" → mark `planPickerSeen=true` → enter editor.

### Backend

A new endpoint `POST /api/billing/plan-picker-dismiss` (or piggyback on existing `POST /api/legal/accept` by updating `publicMetadata` from the client).

Alternatively, the frontend can use Clerk's `updateUser` method directly via `useUser().user.update({ unsafeMetadata: { planPickerSeen: true } })`. Simpler and no backend round-trip.

### Files

- **Create:** `frontend/src/pages/PlanPickerPage.tsx`
- **Create:** `frontend/src/components/PlanPickerCard.tsx`
- **Modify:** `Root.tsx` — wrap editor tree with PlanPickerPage condition, add planPickerSeen check
- **Modify:** `frontend/src/hooks/usePostSignupPlanCheckout.ts` — integrate with plan picker flow

---

## 2. Persistent Pricing in Editor Header

### Behavior

A **PlanBadge** component in the editor header, always visible, showing the user's current plan status and token balance. Replaces the current pattern where pricing is only accessible via the 3-dot Settings menu.

### Placement

In `EditorHeader` (`editor-header.component.tsx`), in the right-side action group alongside the Settings menu and Account menu.

### UI

**PlanBadge** component:

| State | Appearance | Behavior |
|-------|-----------|----------|
| Free tier, tokens remaining | `Free · 3 tokens left` badge in muted style | Click → switch to pricing tab |
| Free tier, tokens low (≤2) | `Free · 1 token left` badge in warning gold | Click → switch to pricing tab |
| Free tier, tokens exhausted | `Free · Upgrade` badge with fire-button CTA | Click → switch to pricing tab |
| Active subscription | `Premium` badge in ember, no CTA | Inactive — just status |
| Loading | Skeleton pulse | N/A |

- Always shows token count beside the plan name
- On subscription: shows plan name only ("Premium", "Studio")
- Badge is compact (pill shape, 11px font, tight padding) — fits inline with existing controls

### Files

- **Create:** `frontend/src/components/PlanBadge.tsx`
- **Modify:** `frontend/src/app/editor-header.component.tsx` — add PlanBadge to action group

---

## 3. Proactive Upsell After First Successful Split

### Behavior

After the user's first split completes and stems appear in the workspace, show a non-blocking upsell panel. Only fires once per user (tracked in `localStorage` or component state).

### Placement

Inline below the stem list in the Workspace view, above the mixer console. Not a modal — it's contextual and dismissable.

### UI

A narrow panel with:
- Ember gradient left border (thermal rim)
- Copy: "Great split. Ready for the full studio?" then bullet benefits: 4-stem splits, HQ quality, batch processing
- Two CTAs: `Start Premium · $15/mo` (fire-button, primary) + `See all plans` (ghost-button)
- `×` dismiss button or "No thanks" link at bottom
- Dismissed permanently for this user (localStorage flag)

### Detection

- After split completes → `splitResultStems.length > 0` AND `subscription.status !== "active"` AND first-split flag not yet set
- Tie into the existing workflow: workspace renders → stems available → check conditions → show panel

### Files

- **Create:** `frontend/src/components/PostSplitUpsell.tsx`
- **Modify:** The workspace component that renders after stems are available (likely within the `PhaseRouter → Workspace` flow or `app-view-switch.component.tsx`)

---

## 4. Token-Use Progress Meter

### Behavior

During the upload/configure phase, show the user how many tokens (minutes) this split will consume from their free allowance. Provides transparency before commitment and creates a natural upgrade moment.

### Placement

In `ConfigurePhase.tsx`, above the "Split" button.

### UI

Compact meter component:
- Label: `Free plan: 3 of 5 tokens remaining` (dynamic from `usageBalance` and plan limits)
- Thin progress bar (4px tall) — green (>50% remaining), gold (25-50%), red (<25%)
- If the current file will exhaust remaining tokens, show a warning: "This split will use your last 2 tokens"
- Clicking the meter or the "Upgrade to get more" link opens the pricing tab
- Welcome tokens shown separately: `Welcome grant: 8 of 10 tokens remaining` in ice blue
- Since token consumption is only known after upload (file duration), compute "estimated tokens" from `duration` (available from the uploaded file via `URL.createObjectURL` + `Audio` element duration)

### Files

- **Create:** `frontend/src/components/TokenMeter.tsx`
- **Modify:** `frontend/src/components/phases/ConfigurePhase.tsx` — render TokenMeter above split button

---

## 5. Auto-Show Onboarding Tour

### Behavior

New users who pass through the plan picker (choosing Free or deferring payment) should see the onboarding tour automatically — not have to find it in the help menu.

### Trigger condition

- `user.publicMetadata.planPickerSeen === true` AND `localStorage` has no `burnt-beats-onboarding-complete` key
- Fire the `"open-onboarding"` event bus signal automatically after the editor mounts

### Implementation

The `OnboardingTour` component already listens for the `"open-onboarding"` typed event via `useAppEvent`. In `EditorAppShell` (or the component that hosts `OnboardingTour`), add a `useEffect` that fires this signal on first mount when the condition is met.

No changes needed to the tour component itself — just wire the auto-trigger.

### Files

- **Modify:** `frontend/src/app/editor-app-shell.component.tsx` — add auto-fire logic for onboarding on first visit

---

## 6. Lead Capture on Landing Page

### Behavior

A compact email sign-up form on the landing page for visitors who don't click the primary CTA. Collects email for future retargeting and product updates.

### Placement

Between the pricing section and the footer, replacing or augmenting the existing `LandingFinalCta` section.

### UI

- Minimal: heading "Get production tips and feature updates" + email input + "Subscribe" button
- Dark input field matching existing form styles, fire-button for subscribe
- Success state: "You're in. We'll send the first email soon." with a check icon
- No modal, no exit intent — just a low-friction inline form
- POST to a backend endpoint or external service (Mailchimp, ConvertKit, etc.)
- For v1: use the same backend Express server, add a simple `POST /api/newsletter/subscribe` that logs/emails the address (or integrates with the existing email provider)

### Files

- **Create:** `frontend/src/components/landing/LeadCaptureForm.tsx`
- **Create:** `backend/routes/newsletter.js` (simple email capture endpoint)
- **Modify:** `frontend/src/pages/LandingPage.tsx` — add LeadCaptureForm before footer
- **Modify:** Modify `LandingFinalCta.tsx` or replace with the combined section

---

## 7. Hero CTA Change

### Behavior

Replace the current "Split your first track free" CTA with a value-focused alternative that attracts subscription-minded users, not free-tool seekers.

### Copy

| Element | Current | New |
|---------|---------|-----|
| Subheading | "Browser workstation for producers and DJs" | Same (keep) |
| H1 | "Burnt Beats" | Same (keep — it's the brand) |
| Supporting text | Long paragraph about features | Shorter: "Upload. Split. Mix. Export. All in your browser — no install, no upload limits, no compromise." |
| Primary CTA | "Split your first track free" | "Try the workstation" |
| Trust line | "Secure Stripe billing · cancel anytime · one-time packs available" | Same (keep) |

The "free" framing moves from the CTA button to the secondary visual context (the plan picker that comes after sign-up).

### Files

- **Modify:** `frontend/src/components/landing/LandingHero.tsx`

---

## Implementation Order (Impact-First)

| Order | Change | Why this order |
|-------|--------|----------------|
| 1 | Plan picker (#1) | Directly intercepts users at peak intent — biggest conversion impact |
| 2 | Pricing header badge (#2) | Makes pricing always visible — next highest leverage |
| 3 | Token meter (#4) | Creates pre-split upgrade awareness — low effort, medium impact |
| 4 | Post-split upsell (#3) | Captures users who just experienced value — medium effort |
| 5 | Onboarding auto-show (#5) | Reduces first-use confusion — low effort |
| 6 | Lead capture (#6) | Builds retargeting list — independent, can be done anytime |
| 7 | Hero CTA (#7) | Brand-level change, lowest urgency since plan picker handles conversion |
