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
      className={`rounded-xl border border-border bg-muted px-sm py-xs text-sm text-secondary-foreground ${className}`.trim()}
    >
      <span className="font-semibold text-primary-200">
        1 token = 1 minute.
      </span>{" "}
      Partial minutes round up. Split and expand are billed separately. Secure
      Stripe checkout, cancel anytime.
    </div>
  );
}

