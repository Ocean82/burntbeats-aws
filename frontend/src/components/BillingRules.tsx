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
      className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 ${className}`.trim()}
    >
      <span className="font-semibold text-amber-200">
        1 token = 1 minute.
      </span>{" "}
      Partial minutes round up. Split and expand are billed separately. Secure
      Stripe checkout, cancel anytime.
    </div>
  );
}

