import type { ReactNode } from "react";
import {
  AppChromeActions,
  AppChromeBillingAlerts,
  AppChromeCancelFlow,
  useAppChromeCancelFlow,
} from "@/components/app/AppChromeActions";
import type { UseSubscriptionResult } from "@/hooks/useSubscription";
import type { ModalKey } from "@/hooks/useUiModals";

export interface HubChromeProps {
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  localDevFullApp: boolean;
  pricingActive: boolean;
  onOpenPricing: () => void;
  openModal: (key: ModalKey) => void;
  openFeedback: () => void;
  onRestartHomeTour: () => void;
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
  openModal,
  openFeedback,
  onRestartHomeTour,
  onOpenLegal,
}: HubChromeProps) {
  const { cancelFlowOpen, openCancelFlow, closeCancelFlow } = useAppChromeCancelFlow();

  return (
    <header
      className="sticky top-0 z-sticky flex flex-col gap-sm border-b border-border/80 bg-background/95 px-6 py-3 backdrop-blur-md md:px-12 lg:px-16"
      aria-label="Burnt Beats"
    >
      <AppChromeBillingAlerts subscription={subscription} />
      <AppChromeCancelFlow
        subscription={subscription}
        open={cancelFlowOpen}
        onClose={closeCancelFlow}
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

        <AppChromeActions
          subscription={subscription}
          usageBalance={usageBalance}
          usageLoading={usageLoading}
          localDevFullApp={localDevFullApp}
          pricingActive={pricingActive}
          onOpenPricing={onOpenPricing}
          openModal={openModal}
          openFeedback={openFeedback}
          onRestartHomeTour={onRestartHomeTour}
          onOpenLegal={onOpenLegal}
          onCancelSubscription={openCancelFlow}
        />
      </div>
    </header>
  );
}
