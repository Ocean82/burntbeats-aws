import { Check, Crown } from "lucide-react";
import { cn } from "../utils/cn";
import type { PlanConfig } from "../data/plans";

interface PlanPickerCardProps {
  plan: PlanConfig;
  isHighlighted?: boolean;
  onSelect: () => void;
  isLoading?: boolean;
}

export function PlanPickerCard({
  plan,
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
