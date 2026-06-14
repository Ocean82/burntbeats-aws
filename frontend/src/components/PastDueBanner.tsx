import { AlertTriangle } from "lucide-react";

interface PastDueBannerProps {
  billingStatus?: string | null;
  onUpdatePayment: () => void;
}

export function PastDueBanner({ billingStatus, onUpdatePayment }: PastDueBannerProps) {
  if (billingStatus !== "past_due") return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-sm rounded-xl border border-warning-400/40 bg-warning-500/15 px-md py-sm"
      data-testid="past-due-banner"
    >
      <div className="flex items-center gap-sm text-sm text-warning-100">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span>Your last payment failed. Update your card to keep Premium access.</span>
      </div>
      <button
        type="button"
        onClick={onUpdatePayment}
        className="min-h-[40px] rounded-lg border border-warning-400/50 bg-warning-500/20 px-md py-xs text-xs font-semibold text-warning-50 transition hover:bg-warning-500/30"
      >
        Update payment
      </button>
    </div>
  );
}
