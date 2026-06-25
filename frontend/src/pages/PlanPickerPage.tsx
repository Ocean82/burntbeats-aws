import { useState } from "react";
import { useUser } from "@clerk/react";
import { useSubscription, type Plan } from "../hooks/useSubscription";
import { getPlansForType, PACK_PLANS, type BillingInterval } from "../data/plans";
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
      await user?.update({ unsafeMetadata: { planPickerSeen: true } });
      await subscription.startCheckout(planId, {
        source: "plan_picker",
        intent: `picker_${planId}`,
        interval,
      });
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
        <div className="mb-lg"><BillingIntervalToggle value={interval} onChange={setInterval} /></div>
        <div className="grid w-full gap-md sm:grid-cols-3">
          {getPlansForType("subscriptions", { interval }).map((plan) => (
            <PlanPickerCard
              key={plan.id} plan={plan}
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
                  key={plan.id} plan={plan}
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
