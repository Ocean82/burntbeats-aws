import { useState } from "react";
import { PlanBadge } from "@/components/PlanBadge";
import { SettingsMenu } from "@/components/SettingsMenu";
import { AccountMenu } from "@/components/AccountMenu";
import { PastDueBanner } from "@/components/PastDueBanner";
import { CancelSubscriptionFlow } from "@/components/CancelSubscriptionFlow";
import type { UseSubscriptionResult } from "@/hooks/useSubscription";
import type { ModalKey } from "@/hooks/useUiModals";

export interface AppChromeBillingAlertsProps {
  subscription: UseSubscriptionResult;
}

export function AppChromeBillingAlerts({ subscription }: AppChromeBillingAlertsProps) {
  return (
    <PastDueBanner
      billingStatus={subscription.billingStatus}
      onUpdatePayment={() => void subscription.openPortal()}
    />
  );
}

export interface AppChromeCancelFlowProps {
  subscription: UseSubscriptionResult;
  open: boolean;
  onClose: () => void;
}

export function AppChromeCancelFlow({
  subscription,
  open,
  onClose,
}: AppChromeCancelFlowProps) {
  return (
    <CancelSubscriptionFlow
      open={open}
      onClose={onClose}
      plan={subscription.plan}
      onOpenPortal={() => void subscription.openPortal()}
      onOfferAccepted={() => subscription.refetch()}
    />
  );
}

export function useAppChromeCancelFlow() {
  const [cancelFlowOpen, setCancelFlowOpen] = useState(false);
  return {
    cancelFlowOpen,
    openCancelFlow: () => setCancelFlowOpen(true),
    closeCancelFlow: () => setCancelFlowOpen(false),
  };
}

export interface AppChromeActionsProps {
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  localDevFullApp: boolean;
  pricingActive: boolean;
  onOpenPricing: () => void;
  openModal: (key: ModalKey) => void;
  openFeedback: () => void;
  onRestartHomeTour: () => void;
  onRestartEditorTour?: () => void;
  onOpenLegal: () => void;
  onCancelSubscription: () => void;
  className?: string;
}

export function AppChromeActions({
  subscription,
  usageBalance,
  usageLoading,
  localDevFullApp,
  pricingActive,
  onOpenPricing,
  openModal,
  openFeedback,
  onRestartHomeTour,
  onRestartEditorTour,
  onOpenLegal,
  onCancelSubscription,
  className,
}: AppChromeActionsProps) {
  return (
    <div className={className ?? "flex flex-wrap items-center gap-xs"}>
      <PlanBadge
        plan={subscription.plan}
        subscriptionStatus={subscription.status}
        freeTokensRemaining={
          usageBalance != null && subscription.status !== "active" ? usageBalance : null
        }
        usageLoading={usageLoading}
      />

      <SettingsMenu
        pricingActive={pricingActive}
        showBilling={subscription.status === "active" && !localDevFullApp}
        usageBalance={usageBalance}
        usageLoading={usageLoading}
        onOpenFullPricingTab={() => {
          const url =
            import.meta.env.VITE_FULL_PRICING_URL ?? "https://www.burntbeats.com/pricing";
          window.open(url, "_blank", "noopener,noreferrer");
        }}
        onOpenPricing={onOpenPricing}
        onOpenPortal={() => void subscription.openPortal()}
        onCancelSubscription={onCancelSubscription}
        onOpenPresets={() => openModal("presets")}
        onOpenHelp={() => openModal("help")}
        onOpenFeedback={openFeedback}
        onRestartHomeTour={onRestartHomeTour}
        onRestartEditorTour={onRestartEditorTour}
        onOpenLegal={onOpenLegal}
      />

      <AccountMenu
        localDevFullApp={localDevFullApp}
        subscriptionPlan={subscription.plan}
        subscriptionActive={subscription.status === "active"}
        usageBalance={usageBalance}
        usageLoading={usageLoading}
      />
    </div>
  );
}
