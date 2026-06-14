import { cn } from "../utils/cn";
import type { BillingInterval } from "../analytics/billingEvents";

interface BillingIntervalToggleProps {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  annualEnabled?: boolean;
}

export function BillingIntervalToggle({
  value,
  onChange,
  annualEnabled = true,
}: BillingIntervalToggleProps) {
  if (!annualEnabled) return null;

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1"
      role="group"
      aria-label="Billing interval"
      data-testid="billing-interval-toggle"
    >
      <button
        type="button"
        onClick={() => onChange("month")}
        className={cn(
          "rounded-full px-md py-xs text-xs font-semibold transition",
          value === "month"
            ? "bg-primary-500/25 text-primary-100"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={value === "month"}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("year")}
        className={cn(
          "rounded-full px-md py-xs text-xs font-semibold transition",
          value === "year"
            ? "bg-primary-500/25 text-primary-100"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={value === "year"}
      >
        Annual
        <span className="ml-1 rounded-full bg-success-500/20 px-1.5 py-0.5 text-[10px] text-success-200">
          Save 20%
        </span>
      </button>
    </div>
  );
}
