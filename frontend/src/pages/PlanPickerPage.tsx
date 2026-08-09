import { useState } from "react";
import { useUser } from "@clerk/react";
import { useSubscription, type Plan } from "../hooks/useSubscription";
import { clearPostSignupPlanIntent } from "../hooks/usePostSignupPlanCheckout";
import {
  getPlansForType,
  PACK_PLANS,
  type BillingInterval,
} from "../data/plans";
import { BillingIntervalToggle } from "../components/BillingIntervalToggle";
import { PlanPickerCard } from "../components/PlanPickerCard";

interface PlanPickerPageProps {
  onComplete: () => void;
}

const SINGLE_PACK = PACK_PLANS.find((p) => p.id === "single");
const TOPUP_PACK = PACK_PLANS.find((p) => p.id === "topup");
const STUDIO_PLAN = getPlansForType("subscriptions").find((p) => p.id === "studio");

export function PlanPickerPage({ onComplete }: PlanPickerPageProps) {
  const { user } = useUser();
  const subscription = useSubscription();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [loading, setLoading] = useState<Plan | null>(null);

  const handleSelectPlan = async (planId: Plan) => {
    setLoading(planId);
    try {
      await user?.update({ unsafeMetadata: { planPickerSeen: true } });
      await subscription.startCheckout(planId, {
        source: "plan_picker",
        intent: `picker_${planId}`,
        interval,
      });
      onComplete();
    } catch {
      setLoading(null);
    }
  };

  const handleContinueFree = async () => {
    clearPostSignupPlanIntent();
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
            Split your first track in under a minute. No subscription required to start.
          </p>
        </div>

        {SINGLE_PACK ? (
          <div className="mb-lg w-full max-w-md">
            <p className="mb-sm text-center text-xs font-semibold uppercase tracking-[0.2em] text-primary-200/80">
              Best way to try your own song
            </p>
            <PlanPickerCard
              plan={SINGLE_PACK}
              isHighlighted
              onSelect={() => handleSelectPlan("single")}
              isLoading={loading === "single"}
            />
          </div>
        ) : null}

        <div className="mb-md w-full">
          <div className="mb-md flex justify-center">
            <BillingIntervalToggle value={interval} onChange={setInterval} />
          </div>
          <p className="mb-sm text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Or subscribe monthly
          </p>
          <div className="grid w-full gap-md sm:grid-cols-2">
            {getPlansForType("subscriptions", { heroOnly: true, interval }).map((plan) => (
              <PlanPickerCard
                key={plan.id}
                plan={plan}
                isHighlighted={plan.highlight}
                onSelect={() => handleSelectPlan(plan.id)}
                isLoading={loading === plan.id}
              />
            ))}
          </div>
        </div>

        <details className="mt-md w-full max-w-md">
          <summary className="cursor-pointer text-center text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            Studio plan &amp; larger packs →
          </summary>
          <div className="mt-md grid gap-md">
            {STUDIO_PLAN ? (
              <PlanPickerCard
                plan={
                  interval === "year"
                    ? {
                        ...STUDIO_PLAN,
                        priceLabel: getPlansForType("subscriptions", { interval }).find(
                          (p) => p.id === "studio",
                        )?.priceLabel ?? STUDIO_PLAN.priceLabel,
                      }
                    : STUDIO_PLAN
                }
                onSelect={() => handleSelectPlan("studio")}
                isLoading={loading === "studio"}
              />
            ) : null}
            {TOPUP_PACK ? (
              <PlanPickerCard
                plan={TOPUP_PACK}
                onSelect={() => handleSelectPlan("topup")}
                isLoading={loading === "topup"}
              />
            ) : null}
          </div>
        </details>

        <button
          type="button"
          onClick={handleContinueFree}
          disabled={loading !== null}
          className="mt-xl rounded-xl border border-border bg-muted/50 px-lg py-sm text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          Continue with Free — 10 min welcome + 5 min/month
        </button>
      </div>
    </div>
  );
}
