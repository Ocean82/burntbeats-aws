import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { API_BASE } from "../config";
import { useAuth } from "@clerk/react";
import { useModalA11y } from "../hooks/useModalA11y";
import {
  trackCancelFlowStarted,
  trackCancelReasonSelected,
  trackSaveOfferAccepted,
  trackSaveOfferDeclined,
  trackSaveOfferShown,
} from "../analytics/billingEvents";
import type { ServerPlan } from "../hooks/useSubscription";

const CANCEL_REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "not_using", label: "Not using it enough" },
  { id: "missing_feature", label: "Missing a feature I need" },
  { id: "technical_issues", label: "Technical issues" },
  { id: "temporary", label: "Taking a break" },
  { id: "switching", label: "Switching to another tool" },
  { id: "other", label: "Other" },
] as const;

type CancelReason = (typeof CANCEL_REASONS)[number]["id"];

type Step = "survey" | "offer" | "confirm";

interface CancelSubscriptionFlowProps {
  open: boolean;
  onClose: () => void;
  plan: ServerPlan | null;
  onOpenPortal: () => void;
  onOfferAccepted?: () => void;
}

function offersForReason(reason: CancelReason): { id: string; label: string; description: string }[] {
  if (reason === "too_expensive") {
    return [
      { id: "discount_25_3mo", label: "25% off for 3 months", description: "Keep Premium at a lower rate." },
      { id: "downgrade_basic", label: "Switch to Basic ($9/mo)", description: "2-stem speed splits with rollover tokens." },
    ];
  }
  if (reason === "not_using" || reason === "temporary") {
    return [
      { id: "pause_1_month", label: "Pause 1 month", description: "Billing pauses — resume automatically." },
      { id: "pause_3_months", label: "Pause 3 months", description: "Take a longer break without losing your account." },
    ];
  }
  if (reason === "technical_issues") {
    return [
      { id: "support", label: "Contact support first", description: "We respond within 24 hours at support@burntbeats.com" },
    ];
  }
  return [
    { id: "downgrade_basic", label: "Downgrade to Basic", description: "Lower monthly cost, keep the workstation." },
  ];
}

/**
 * Outer shell: manages open/close lifecycle and AnimatePresence transitions.
 * The stateful dialog body (CancelFlowContent) mounts fresh each time `open`
 * becomes true, so state is automatically reset without useEffect-based resets.
 */
export function CancelSubscriptionFlow({
  open,
  onClose,
  plan,
  onOpenPortal,
  onOfferAccepted,
}: CancelSubscriptionFlowProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, modalRef, onClose);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-modal-backdrop bg-secondary/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <div className="fixed inset-0 z-modal flex items-center justify-center p-md pointer-events-none">
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-flow-title"
              tabIndex={-1}
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-popover p-lg shadow-elevation-xl outline-none"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <CancelFlowContent
                plan={plan}
                onClose={onClose}
                onOpenPortal={onOpenPortal}
                onOfferAccepted={onOfferAccepted}
              />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Stateful dialog content. Mounts fresh each time the dialog opens,
 * ensuring clean initial state without explicit reset effects.
 */
function CancelFlowContent({
  plan,
  onClose,
  onOpenPortal,
  onOfferAccepted,
}: {
  plan: ServerPlan | null;
  onClose: () => void;
  onOpenPortal: () => void;
  onOfferAccepted?: () => void;
}) {
  const { getToken } = useAuth();
  const [step, setStep] = useState<Step>("survey");
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track analytics on mount (component only mounts when dialog opens)
  useEffect(() => {
    trackCancelFlowStarted(plan);
  }, [plan]);

  const postJson = useCallback(async (path: string, body: Record<string, unknown>) => {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/api/billing${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(j?.error || "Request failed");
    }
    return res.json();
  }, [getToken]);

  const handleReasonSelect = async (selected: CancelReason) => {
    setReason(selected);
    trackCancelReasonSelected(selected);
    setLoading(true);
    setError(null);
    try {
      await postJson("/cancel-survey", { reason: selected });
      setStep("offer");
      const offers = offersForReason(selected);
      if (offers[0]) trackSaveOfferShown(offers[0].id, selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save feedback");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    if (offerId === "support") {
      window.open("mailto:support@burntbeats.com?subject=Burnt%20Beats%20billing%20help", "_self");
      onClose();
      return;
    }
    setLoading(true);
    setError(null);
    trackSaveOfferAccepted(offerId);
    try {
      await postJson("/retention-offer", { offerType: offerId, reason: reason ?? "other" });
      onOfferAccepted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply offer");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    setLoading(true);
    setError(null);
    try {
      await postJson("/cancel-confirm", { reason: reason ?? "other" });
      onOpenPortal();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel");
    } finally {
      setLoading(false);
    }
  };

  const offers = reason ? offersForReason(reason) : [];

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-md top-md rounded-lg p-xs text-muted-foreground hover:bg-muted"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      <h2 id="cancel-flow-title" className="text-lg font-semibold text-foreground">
        {step === "survey" && "Before you go…"}
        {step === "offer" && "We'd love to keep you"}
        {step === "confirm" && "Confirm cancellation"}
      </h2>

      {error && (
        <p className="mt-sm rounded-lg border border-destructive/40 bg-destructive/10 px-sm py-xs text-sm text-destructive-200">
          {error}
        </p>
      )}

      {step === "survey" && (
        <div className="mt-md space-y-xs">
          <p className="text-sm text-secondary-foreground">
            What's the main reason you're cancelling?
          </p>
          {CANCEL_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={loading}
              onClick={() => void handleReasonSelect(r.id)}
              className="flex min-h-[44px] w-full items-center rounded-lg border border-border px-md py-sm text-left text-sm text-secondary-foreground transition hover:border-primary-400/40 hover:bg-primary-500/10"
            >
              {loading && reason === r.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {r.label}
            </button>
          ))}
        </div>
      )}

      {step === "offer" && reason && (
        <div className="mt-md space-y-sm">
          {offers.map((offer) => (
            <button
              key={offer.id}
              type="button"
              disabled={loading}
              onClick={() => void handleAcceptOffer(offer.id)}
              className="w-full rounded-xl border border-primary-400/35 bg-primary-500/10 px-md py-sm text-left transition hover:bg-primary-500/20"
            >
              <p className="font-semibold text-primary-100">{offer.label}</p>
              <p className="text-xs text-secondary-foreground">{offer.description}</p>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              trackSaveOfferDeclined(offers[0]?.id ?? "none");
              setStep("confirm");
            }}
            className="w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Continue cancelling
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className="mt-md space-y-md">
          <p className="text-sm text-secondary-foreground">
            Your subscription will cancel at the end of the current billing period.
            You keep access until then.
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleConfirmCancel()}
            className="w-full rounded-lg border border-destructive/40 bg-destructive/15 px-md py-sm text-sm font-semibold text-destructive-100"
          >
            {loading ? "Processing…" : "Cancel at period end"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-sm text-primary-200 hover:underline"
          >
            Keep subscription
          </button>
        </div>
      )}
    </>
  );
}
