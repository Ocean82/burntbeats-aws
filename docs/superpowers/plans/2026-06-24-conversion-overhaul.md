# Burnt Beats Conversion Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Increase free-to-paid conversion rate by inserting a plan-picker at sign-up, making pricing always visible, adding proactive upsell moments, and improving landing page conversion signals.

**Architecture:** 7 independent UI changes across the frontend. All changes consume existing hooks (`useSubscription`, `useUsageBalance`, `useAppStore`, `useUser`) and the existing event bus. No new backend endpoints. Plan picker gating uses Clerk `user.update({ unsafeMetadata })`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Clerk, Stripe, zustand, wouter, framer-motion. `npm run build` and `npm run test` in `frontend/`.

## Global Constraints

- All new components follow existing dark forge design system (oklch colors, glass panels, fire/ice thermal palette, Space Grotesk + Manrope)
- New components live in `frontend/src/components/` (shared) or `frontend/src/components/landing/` (landing page)
- Pages live in `frontend/src/pages/` — use named exports (default exports only for lazy-loaded route components)
- Clerk `unsafeMetadata` set client-side via `useUser().user.update({ unsafeMetadata: { key: val } })`
- `useSubscription` is from `frontend/src/hooks/useSubscription.ts`; `useUsageBalance` from `frontend/src/hooks/useUsageBalance.ts`; `useAppStore` from `frontend/src/store/appStore.ts`
- Plans defined in `frontend/src/data/plans.ts`; types `Plan`, `PlanConfig`, `BillingInterval` from same file
- No new backend endpoints unless explicitly specified

---

### Task 1: Persistent Pricing Badge in Editor Header (PlanBadge)

**Files:**
- Create: `frontend/src/components/PlanBadge.tsx`
- Modify: `frontend/src/app/editor-header.component.tsx`

**Depends on:** nothing
**Provides:** PlanBadge component consumed by EditorHeader

- [ ] **Step 1: Create PlanBadge component**

```tsx
import { Crown, Coins, ArrowRight } from "lucide-react";
import { cn } from "../utils/cn";

interface PlanBadgeProps {
  plan: string | null;
  subscriptionStatus: "loading" | "active" | "inactive" | "error";
  freeTokensRemaining: number | null;
  usageLoading: boolean;
  onUpgrade: () => void;
}

export function PlanBadge({
  plan,
  subscriptionStatus,
  freeTokensRemaining,
  usageLoading,
  onUpgrade,
}: PlanBadgeProps) {
  const isPaid = subscriptionStatus === "active";
  const isLoading = subscriptionStatus === "loading";
  const isLowTokens = !isPaid && !isLoading && freeTokensRemaining != null && freeTokensRemaining <= 2;

  if (isLoading) {
    return <span className="inline-flex h-7 w-20 animate-pulse rounded-full bg-muted" />;
  }

  if (isPaid && plan) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary-400/30 bg-primary-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-200/90">
        <Crown className="h-3 w-3" aria-hidden />
        {plan}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onUpgrade}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition",
        isLowTokens
          ? "border-warning-gold/40 bg-warning-gold/12 text-warning-gold hover:border-warning-gold/60 hover:bg-warning-gold/20"
          : "border-border bg-muted text-muted-foreground hover:border-primary-400/40 hover:text-primary-200",
      )}
    >
      <Coins className="h-3 w-3" aria-hidden />
      Free{!usageLoading && freeTokensRemaining != null ? ` · ${freeTokensRemaining} left` : ""}
      <ArrowRight className="ml-0.5 h-2.5 w-2.5 opacity-60" aria-hidden />
    </button>
  );
}
```

- [ ] **Step 2: Add PlanBadge to EditorHeader**

In `editor-header.component.tsx`:
- Import `PlanBadge` from `"../components/PlanBadge"`
- In the action group (`flex flex-wrap items-center gap-xs` div around line 151), add before `<SettingsMenu>`:

```tsx
<PlanBadge
  plan={subscription.plan}
  subscriptionStatus={subscription.status}
  freeTokensRemaining={usageBalance != null && subscription.status !== "active" ? usageBalance : null}
  usageLoading={usageLoading}
  onUpgrade={() => setActiveView("pricing")}
/>
```

- [ ] **Step 3: Build and test**

Run: `cd frontend && npm run build && npm run test`

- [ ] **Step 4: Commit**

```
git add frontend/src/components/PlanBadge.tsx frontend/src/app/editor-header.component.tsx
git commit -m "feat: add persistent plan badge to editor header"
```

---

### Task 2: Post-Sign-Up Plan Picker Page

**Files:**
- Create: `frontend/src/components/PlanPickerCard.tsx`
- Create: `frontend/src/pages/PlanPickerPage.tsx`
- Modify: `frontend/src/Root.tsx`

**Depends on:** nothing
**Provides:** PlanPickerPage rendered inside a `PlanPickerGate` wrapper in Root.tsx

- [ ] **Step 1: Create PlanPickerCard component**

`frontend/src/components/PlanPickerCard.tsx`:

```tsx
import { Check, Crown } from "lucide-react";
import { cn } from "../utils/cn";
import type { PlanConfig, BillingInterval } from "../data/plans";

interface PlanPickerCardProps {
  plan: PlanConfig;
  interval: BillingInterval;
  isHighlighted?: boolean;
  onSelect: () => void;
  isLoading?: boolean;
}

export function PlanPickerCard({
  plan,
  interval,
  isHighlighted,
  onSelect,
  isLoading,
}: PlanPickerCardProps) {
  return (
    <article className={cn(
      "relative flex flex-col rounded-2xl border p-lg transition",
      isHighlighted
        ? "border-primary-400/40 bg-primary-500/8 shadow-elevation-lg ring-1 ring-primary-400/20"
        : "border-border bg-muted/60",
    )}>
      {isHighlighted && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-primary-500 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          <Crown className="h-3 w-3" aria-hidden /> Most popular
        </span>
      )}
      <div className="mb-md text-center">
        <p className="text-lg font-bold text-foreground">{plan.name}</p>
        <p className="mt-2 text-2xl font-bold text-primary-200">{plan.priceLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
      </div>
      <ul className="mb-lg flex-1 space-y-2 text-sm text-secondary-foreground">
        {plan.details.slice(0, 4).map((d) => (
          <li key={d} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" aria-hidden />
            <span>{d}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSelect}
        disabled={isLoading}
        className={cn(
          "w-full rounded-xl py-2.5 text-sm font-semibold transition",
          isHighlighted ? "fire-button" : "border border-border bg-muted text-secondary-foreground hover:bg-secondary",
        )}
      >
        {plan.cta}
      </button>
    </article>
  );
}
```

- [ ] **Step 2: Create PlanPickerPage**

`frontend/src/pages/PlanPickerPage.tsx`:

```tsx
import { useState } from "react";
import { useUser } from "@clerk/react";
import { useSubscription, type Plan } from "../hooks/useSubscription";
import { SUBSCRIPTION_PLANS, PACK_PLANS, type BillingInterval } from "../data/plans";
import { BillingIntervalToggle } from "../components/BillingIntervalToggle";
import { PlanPickerCard } from "../components/PlanPickerCard";

interface PlanPickerPageProps {
  onComplete: () => void;
}

export function PlanPickerPage({ onComplete }: PlanPickerPageProps) {
  const { user } = useUser();
  const subscription = useSubscription();
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [loading, setLoading] = useState<Plan | null>(null);

  const handleSelectPlan = async (planId: Plan) => {
    setLoading(planId);
    try {
      await subscription.startCheckout(planId, {
        source: "plan_picker",
        intent: `picker_${planId}`,
        interval,
      });
      await user?.update({ unsafeMetadata: { planPickerSeen: true } });
      onComplete();
    } catch { setLoading(null); }
  };

  const handleContinueFree = async () => {
    await user?.update({ unsafeMetadata: { planPickerSeen: true } });
    onComplete();
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="mesh-overlay" />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-md py-10">
        <div className="mb-lg text-center">
          <img src="/logo-emblem.png" alt="" className="logo-emblem mx-auto h-12 w-12" aria-hidden />
          <h1 className="mt-md text-3xl font-bold text-foreground">Choose your setup</h1>
          <p className="mt-xs text-sm text-secondary-foreground">
            You're 30 seconds from your first split. Pick the plan that fits your workflow.
          </p>
        </div>
        <div className="mb-lg"><BillingIntervalToggle interval={interval} onChange={setInterval} /></div>
        <div className="grid w-full gap-md sm:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <PlanPickerCard
              key={plan.id} plan={plan} interval={interval}
              isHighlighted={plan.highlight}
              onSelect={() => handleSelectPlan(plan.id)}
              isLoading={loading === plan.id}
            />
          ))}
        </div>
        {PACK_PLANS.length > 0 && (
          <details className="mt-lg w-full max-w-md">
            <summary className="cursor-pointer text-center text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              One-time packs available →
            </summary>
            <div className="mt-md grid gap-md sm:grid-cols-2">
              {PACK_PLANS.map((plan) => (
                <PlanPickerCard
                  key={plan.id} plan={plan} interval={interval}
                  onSelect={() => handleSelectPlan(plan.id)}
                  isLoading={loading === plan.id}
                />
              ))}
            </div>
          </details>
        )}
        <button
          type="button"
          onClick={handleContinueFree}
          disabled={loading !== null}
          className="mt-xl text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          Continue with Free (5 tokens/month)
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire PlanPickerGate into Root.tsx**

In `Root.tsx`:

Add a `PlanPickerGate` wrapper component before `export function Root()`:

```tsx
import { useState, useMemo } from "react";
import { useUser } from "@clerk/react";
import { PlanPickerPage } from "./pages/PlanPickerPage";

function PlanPickerGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [dismissed, setDismissed] = useState(false);

  const pickerSeen = useMemo(() => {
    if (!isLoaded || !user) return true;
    const meta = user.unsafeMetadata as Record<string, unknown> | undefined;
    return meta?.planPickerSeen === true;
  }, [isLoaded, user]);

  if (pickerSeen || dismissed) return <>{children}</>;

  return <PlanPickerPage onComplete={() => setDismissed(true)} />;
}
```

Modify `SignedInAppTree` to wrap with `PlanPickerGate` inside `LegalAcceptanceGate`:

```tsx
function SignedInAppTree() {
  return (
    <Suspense fallback={<RouteLoadingShell />}>
      <LegalAcceptanceGate>
        <PlanPickerGate>
          <WorkflowProvider>
            <StemMediaProvider>
              <AudioProvider>
                <AppShell>
                  <App />
                </AppShell>
              </AudioProvider>
            </StemMediaProvider>
          </WorkflowProvider>
        </PlanPickerGate>
      </LegalAcceptanceGate>
    </Suspense>
  );
}
```

- [ ] **Step 4: Build and test**

Run: `cd frontend && npm run build && npm run test`

- [ ] **Step 5: Commit**

```
git add frontend/src/components/PlanPickerCard.tsx frontend/src/pages/PlanPickerPage.tsx frontend/src/Root.tsx
git commit -m "feat: add post-sign-up plan picker page"
```

---

### Task 3: Token Meter in Configure Phase

**Files:**
- Create: `frontend/src/components/TokenMeter.tsx`
- Modify: `frontend/src/components/phases/ConfigurePhase.tsx`

**Depends on:** nothing (reads from existing hooks/store directly)

- [ ] **Step 1: Create TokenMeter component**

`frontend/src/components/TokenMeter.tsx`:

```tsx
import { Coins, AlertTriangle } from "lucide-react";
import { cn } from "../utils/cn";

interface TokenMeterProps {
  freeTokensRemaining: number | null;
  isPaidUser: boolean;
  usageLoading: boolean;
  onUpgrade: () => void;
  estimatedTokens?: number | null;
}

export function TokenMeter({
  freeTokensRemaining,
  isPaidUser,
  usageLoading,
  onUpgrade,
  estimatedTokens,
}: TokenMeterProps) {
  if (isPaidUser || usageLoading || freeTokensRemaining == null) return null;

  const showWarning = estimatedTokens != null && estimatedTokens >= freeTokensRemaining;
  const pct = Math.min(100, Math.max(0, (freeTokensRemaining / 5) * 100));
  const barColor = pct > 50 ? "bg-success-green" : pct > 25 ? "bg-warning-gold" : "bg-error-red";

  return (
    <div className="mb-md rounded-xl border border-border bg-muted/60 p-md">
      <div className="flex items-center justify-between gap-sm">
        <span className="flex items-center gap-2 text-xs text-secondary-foreground">
          <Coins className="h-3.5 w-3.5 text-primary-400" aria-hidden />
          Free plan: <strong>{freeTokensRemaining} token{freeTokensRemaining !== 1 ? "s" : ""}</strong> remaining this month
        </span>
        <button type="button" onClick={onUpgrade}
          className="text-xs font-medium text-primary-300 hover:text-primary-200 underline underline-offset-2">
          Upgrade
        </button>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
      {showWarning && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warning-gold">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          <span>This split may use your last tokens. Consider upgrading to avoid interruptions.</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate TokenMeter into ConfigurePhase**

In `frontend/src/components/phases/ConfigurePhase.tsx`:

- Import `useSubscription` from `../../hooks/useSubscription`
- Import `useUsageBalance` from `../../hooks/useUsageBalance`
- Import `TokenMeter` from `../TokenMeter`
- At the top of the `ConfigurePhase` function body, add:
  ```tsx
  const { status } = useSubscription();
  const { freeMonthlyRemaining, loading: usageLoading } = useUsageBalance(true);
  ```
- Inside the card div (before the quality fieldset), add:
  ```tsx
  <TokenMeter
    freeTokensRemaining={freeMonthlyRemaining}
    isPaidUser={status === "active"}
    usageLoading={usageLoading}
    onUpgrade={() => {
      // Navigate to pricing via parent callback — the parent can pass this
    }}
  />
  ```

Since `ConfigurePhase` currently doesn't have an `onUpgrade` callback in its props, either:
- Option A: Add an `onUpgrade?: () => void` prop to `ConfigurePhaseProps` and the parent that renders it passes `() => setActiveView("pricing")`
- Option B: Use the event bus: `window.dispatchEvent(new CustomEvent("open-pricing-tab"))`

Use Option B for simplicity — add a global event listener in `editor-app-shell.component.tsx` that switches to pricing view when `"open-pricing-tab"` fires.

- [ ] **Step 3: Add global event listener for pricing navigation**

In `editor-app-shell.component.tsx`, add a `useEffect`:

```tsx
useEffect(() => {
  const handler = () => session.ui.setActiveView("pricing");
  window.addEventListener("open-pricing-tab", handler);
  return () => window.removeEventListener("open-pricing-tab", handler);
}, [session.ui.setActiveView]);
```

- [ ] **Step 4: Build and test**

Run: `cd frontend && npm run build && npm run test`

- [ ] **Step 5: Commit**

```
git add frontend/src/components/TokenMeter.tsx frontend/src/components/phases/ConfigurePhase.tsx frontend/src/app/editor-app-shell.component.tsx
git commit -m "feat: add token meter to configure phase"
```

---

### Task 4: Proactive Post-Split Upsell

**Files:**
- Create: `frontend/src/components/PostSplitUpsell.tsx`
- Modify: The workspace component that renders after stems appear

**Depends on:** nothing

- [ ] **Step 1: Create PostSplitUpsell component**

`frontend/src/components/PostSplitUpsell.tsx`:

```tsx
import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";

interface PostSplitUpsellProps {
  isPaidUser: boolean;
  hasStems: boolean;
  onStartPremium: () => void;
  onViewPlans: () => void;
}

const DISMISSED_KEY = "burnt-beats-post-split-upsell-dismissed";

export function PostSplitUpsell({
  isPaidUser,
  hasStems,
  onStartPremium,
  onViewPlans,
}: PostSplitUpsellProps) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "true");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!dismissed && hasStems && !isPaidUser) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [dismissed, hasStems, isPaidUser]);

  if (!visible) return null;

  return (
    <div className="relative rounded-xl border-l-4 border-l-primary-400 border border-border bg-muted/80 p-md">
      <button
        type="button"
        onClick={() => { setDismissed(true); localStorage.setItem(DISMISSED_KEY, "true"); }}
        className="absolute right-2 top-2 rounded-lg p-1 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 h-5 w-5 shrink-0 text-primary-400" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">Great split. Ready for the full studio?</p>
          <ul className="mt-1 space-y-0.5 text-xs text-secondary-foreground">
            <li>4-stem splits — isolate vocals, drums, bass, and melody</li>
            <li>HQ quality modes — cleaner separation</li>
            <li>Batch queue — process multiple tracks at once</li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onStartPremium}
              className="fire-button rounded-lg px-md py-1.5 text-xs font-semibold">
              Start Premium · $15/mo
            </button>
            <button type="button" onClick={onViewPlans}
              className="ghost-button rounded-lg px-md py-1.5 text-xs font-semibold">
              See all plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire PostSplitUpsell into the workspace**

Find where stems render after a split completes. The `Workspace` component (`frontend/src/components/workspace/Workspace.tsx`) is the post-split editing view. However, this component uses path aliases (`@/utils/cn`), so match the import style.

In `Workspace.tsx`:
- Import `PostSplitUpsell` from `../PostSplitUpsell`
- Import `useSubscription` from `../../hooks/useSubscription`
- Add a subscription check: `const { status } = useSubscription();`
- Render PostSplitUpsell between the transport bar and the waveform/mixer grid. Add where meaningful — e.g., at the bottom of the layout, before the mixer, or in a dedicated row. The simplest: render it as a `div` sibling to the grid layout.

Add near the top of the JSX:

```tsx
<PostSplitUpsell
  isPaidUser={status === "active"}
  hasStems={splitResultStems.length > 0}
  onStartPremium={() => {
    // Fire checkout directly
    window.dispatchEvent(new CustomEvent("start-premium-checkout"));
  }}
  onViewPlans={() => {
    window.dispatchEvent(new CustomEvent("open-pricing-tab"));
  }}
/>
```

Add event handlers in the parent (`editor-app-shell.component.tsx` or equivalent that has access to `subscription.startCheckout`) to handle `"start-premium-checkout"`.

- [ ] **Step 3: Handle upgrade events in editor-app-shell**

In `editor-app-shell.component.tsx`, add to the existing event listener effect:

```tsx
useEffect(() => {
  const handlePricing = () => session.ui.setActiveView("pricing");
  const handlePremiumCheckout = () => {
    void session.subscription.startCheckout("premium", {
      source: "post_split_upsell",
      intent: "post_split_upsell_premium",
    });
  };
  window.addEventListener("open-pricing-tab", handlePricing);
  window.addEventListener("start-premium-checkout", handlePremiumCheckout);
  return () => {
    window.removeEventListener("open-pricing-tab", handlePricing);
    window.removeEventListener("start-premium-checkout", handlePremiumCheckout);
  };
}, [session.ui.setActiveView, session.subscription.startCheckout]);
```

- [ ] **Step 4: Build and test**

Run: `cd frontend && npm run build && npm run test`

- [ ] **Step 5: Commit**

```
git add frontend/src/components/PostSplitUpsell.tsx frontend/src/components/workspace/Workspace.tsx frontend/src/app/editor-app-shell.component.tsx
git commit -m "feat: add proactive post-split upsell"
```

---

### Task 5: Auto-Show Onboarding Tour for New Users

**Files:**
- Modify: `frontend/src/app/editor-app-shell.component.tsx`

**Depends on:** Task 2 (relies on `planPickerSeen` being set; but functionally independent — uses localStorage as fallback)

- [ ] **Step 1: Add auto-trigger logic**

In `editor-app-shell.component.tsx`, add a `useEffect` that fires the `"open-onboarding"` event bus signal when:
1. The editor mounts for the first time
2. The user hasn't completed onboarding (`localStorage` key `"burnt-beats-onboarding-complete"` not set)
3. Ideally, only for users who went through the plan picker (though this is optional — the tour helps all new users)

The `OnboardingTour` component (at `frontend/src/components/OnboardingTour.tsx`) already listens for `useAppEvent("open-onboarding", ...)`. We just need to fire it.

Add in `EditorAppShell`:

```tsx
import { useAppEvent } from "../store/eventBus";
import { useUser } from "@clerk/react";

// Inside the component body:
const { user, isLoaded } = useUser();
const didOnboarding = localStorage.getItem("burnt-beats-onboarding-complete");

useEffect(() => {
  if (!isLoaded || didOnboarding === "true") return;
  const meta = user?.unsafeMetadata as Record<string, unknown> | undefined;
  // Auto-show if they went through plan picker (or if we can't tell, just show it)
  if (meta?.planPickerSeen === true || !meta?.planPickerSeen) {
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("open-onboarding"));
    }, 1500);
    return () => clearTimeout(t);
  }
}, [isLoaded, didOnboarding, user]);
```

- [ ] **Step 2: Build and test**

Run: `cd frontend && npm run build && npm run test`

- [ ] **Step 3: Commit**

```
git add frontend/src/app/editor-app-shell.component.tsx
git commit -m "feat: auto-show onboarding tour for new users"
```

---

### Task 6: Lead Capture Form on Landing Page

**Files:**
- Create: `frontend/src/components/landing/LeadCaptureForm.tsx`
- Modify: `frontend/src/pages/LandingPage.tsx`

**Depends on:** nothing

- [ ] **Step 1: Create LeadCaptureForm component**

`frontend/src/components/landing/LeadCaptureForm.tsx`:

```tsx
import { useState } from "react";
import { Mail, Check } from "lucide-react";

export function LeadCaptureForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Could not subscribe. Try again later.");
    }
  };

  if (status === "success") {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl border border-success-400/30 bg-success-500/10 px-lg py-md text-sm text-success-200">
        <Check className="h-4 w-4" aria-hidden />
        You're in. We'll send the first email soon.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md">
      <p className="mb-sm text-center text-sm font-medium text-secondary-foreground">
        Get production tips and feature updates
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            className="w-full rounded-xl border border-border bg-muted py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary-400/50 focus:outline-none focus:ring-1 focus:ring-primary-400/30"
          />
        </div>
        <button type="submit" disabled={status === "submitting"}
          className="fire-button shrink-0 rounded-xl px-md py-2.5 text-sm font-semibold disabled:opacity-60">
          {status === "submitting" ? "Sending..." : "Subscribe"}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-1 text-xs text-error-red">{errorMsg}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Create backend newsletter endpoint**

`backend/routes/newsletter.js`:

```js
import { Router } from "express";

export const newsletterRouter = Router();

newsletterRouter.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body && typeof req.body === "object" ? req.body : {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }
    // For v1: log the email. Replace with Mailchimp/ConvertKit integration later.
    console.log("[newsletter] New subscriber:", email);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Internal error" });
  }
});
```

Mount in the main backend router. Find where other routes are mounted (likely `backend/index.js` or `backend/app.js`) and add:

```js
import { newsletterRouter } from "./routes/newsletter.js";
app.use("/api/newsletter", newsletterRouter);
```

- [ ] **Step 3: Add LeadCaptureForm to LandingPage**

In `frontend/src/pages/LandingPage.tsx`, import and render `LeadCaptureForm` between `LandingFinalCta` and the footer:

```tsx
import { LeadCaptureForm } from "../components/landing/LeadCaptureForm";

// Inside the main content, after <LandingFinalCta /> and before <footer />:
<div className="py-xl">
  <LeadCaptureForm />
</div>
```

- [ ] **Step 4: Build and test**

Run: `cd frontend && npm run build && npm run test`

- [ ] **Step 5: Commit**

```
git add frontend/src/components/landing/LeadCaptureForm.tsx frontend/src/pages/LandingPage.tsx backend/routes/newsletter.js
git commit -m "feat: add lead capture form to landing page"
```

---

### Task 7: Hero CTA Copy Change

**Files:**
- Modify: `frontend/src/components/landing/LandingHero.tsx`

**Depends on:** nothing

- [ ] **Step 1: Update hero copy**

In `LandingHero.tsx`, make these changes:

Change the hero paragraph (line 51-55):
```tsx
<p className="mx-auto max-w-[56ch] text-center text-[clamp(1rem,2.5vw,1.25rem)] font-light leading-relaxed text-secondary-foreground">
  Upload. Split. Mix. Export. All in your browser — no install, no upload limits, no compromise.
</p>
```

Change the primary CTA button text (line 68):
```tsx
Try the workstation
```

- [ ] **Step 2: Build and test**

Run: `cd frontend && npm run build && npm run test`

- [ ] **Step 3: Commit**

```
git add frontend/src/components/landing/LandingHero.tsx
git commit -m "fix: update hero CTA to attract subscription-minded users"
```
