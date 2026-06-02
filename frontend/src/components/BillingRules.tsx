interface BillingRulesProps {
  className?: string;
}

/**
 * Shared conversion-critical billing explainer.
 * Reused across landing, pricing, and paywall to keep economics consistent.
 */
export function BillingRules({ className = "" }: BillingRulesProps) {
  return (
    <div
      className={`text-readable rounded-xl border border-border bg-muted px-sm py-xs text-sm text-secondary-foreground ${className}`.trim()}
    >
      <span className="font-semibold text-primary-200">
        1 token = 1 minute.
      </span>{" "}
      Partial minutes round up. Pick the 2-stem or 4-stem mode you want and pay
      once for that job. Secure Stripe checkout, cancel anytime.
    </div>
  );
}

