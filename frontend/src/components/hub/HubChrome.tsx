import { useState, type ReactNode } from "react";
import { PlanBadge } from "@/components/PlanBadge";
import { SettingsMenu } from "@/components/SettingsMenu";
import { AccountMenu } from "@/components/AccountMenu";
import { PastDueBanner } from "@/components/PastDueBanner";
import { CancelSubscriptionFlow } from "@/components/CancelSubscriptionFlow";
import type { UseSubscriptionResult } from "@/hooks/useSubscription";
import type { ModalKey } from "@/hooks/useUiModals";

export interface HubChromeProps {
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  localDevFullApp: boolean;
  pricingActive: boolean;
  onOpenPricing: () => void;
  onOpenPortal: () => void;
  openModal: (key: ModalKey) => void;
  openFeedback: () => void;
  openOnboarding: () => void;
  onOpenLegal: () => void;
  children?: ReactNode;
}

export function HubChrome({
  subscription,
  usageBalance,
  usageLoading,
  localDevFullApp,
  pricingActive,
  onOpenPricing,
  onOpenPortal,
  openModal,
  openFeedback,
  openOnboarding,
  onOpenLegal,
}: HubChromeProps) {
  const [cancelFlowOpen, setCancelFlowOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-sticky flex flex-col gap-sm border-b border-border/80 bg-background/95 px-6 py-3 backdrop-blur-md md:px-12 lg:px-16"
      aria-label="Burnt Beats"
    >
      <PastDueBanner
        billingStatus={subscription.billingStatus}
        onUpdatePayment={() => void subscription.openPortal()}
      />
      <CancelSubscriptionFlow
        open={cancelFlowOpen}
        onClose={() => setCancelFlowOpen(false)}
        plan={subscription.plan}
        onOpenPortal={() => void subscription.openPortal()}
        onOfferAccepted={() => subscription.refetch()}
      />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-md">
        <div className="flex min-w-0 items-center gap-sm sm:gap-md">
          <img
            src="/logo-emblem.png"
            alt=""
            className="logo-emblem h-9 w-9 shrink-0 sm:h-10 sm:w-10"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="logo-burnt">
              <span className="logo-burnt-fire block text-xl sm:text-2xl">Burnt Beats</span>
            </div>
            <p className="editor-header-tagline mt-0.5 hidden text-xs text-muted-foreground sm:block">
              Split · Mix · Master · Export
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-xs">
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
            onOpenPortal={onOpenPortal}
            onCancelSubscription={() => setCancelFlowOpen(true)}
            onOpenPresets={() => openModal("presets")}
            onOpenHelp={() => openModal("help")}
            onOpenFeedback={openFeedback}
            onRestartTour={openOnboarding}
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
      </div>
    </header>
  );
}
