import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Coins,
  CreditCard,
  ExternalLink,
  HelpCircle,
  MessageSquarePlus,
  MoreVertical,
  Save,
  Scale,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "../utils/cn";

export interface SettingsMenuProps {
  showBilling: boolean;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  pricingActive?: boolean;
  onOpenPricing: () => void;
  onOpenFullPricingTab: () => void;
  onOpenPortal: () => void;
  onOpenPresets: () => void;
  onOpenHelp: () => void;
  onOpenFeedback: () => void;
  onRestartTour: () => void;
  onOpenLegal: () => void;
}

/**
 * Three-dot settings menu: plans, billing, usage, and app utilities.
 */
export function SettingsMenu({
  showBilling,
  usageBalance,
  usageLoading,
  pricingActive = false,
  onOpenPricing,
  onOpenFullPricingTab,
  onOpenPortal,
  onOpenPresets,
  onOpenHelp,
  onOpenFeedback,
  onRestartTour,
  onOpenLegal,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = "settings-menu-panel";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const tokenLabel = usageLoading
    ? "…"
    : usageBalance != null
      ? `${Math.floor(usageBalance)} left`
      : undefined;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition hover:text-foreground tap-feedback",
          (open || pricingActive) &&
            "border-primary-400/45 bg-primary-500/12 text-primary-100",
        )}
        aria-haspopup="true"
        aria-controls={menuId}
        aria-expanded={open ? "true" : "false"}
        aria-label={open ? "Close settings menu" : "Open settings menu"}
        title="Settings"
        data-testid="settings-menu-trigger"
      >
        <MoreVertical className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div
          id={menuId}
          data-testid="settings-menu-panel"
          className="absolute right-0 top-full z-dropdown mt-xs w-56 max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-popover/98 py-1 shadow-elevation-xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between px-md py-sm border-b border-border">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Settings
            </span>
            <button
              type="button"
              onClick={close}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-secondary-foreground"
              aria-label="Close settings menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-sm py-xs">
            <p className="px-1 pb-1 text-meta font-semibold uppercase tracking-wider text-muted-foreground">
              Plans & billing
            </p>
            <SettingsMenuItem
              icon={<CreditCard className="h-4 w-4" />}
              label="Plans & subscriptions"
              testId="settings-menu-pricing"
              active={pricingActive}
              onClick={() => {
                onOpenPricing();
                close();
              }}
            />
            <SettingsMenuItem
              icon={<Coins className="h-4 w-4" />}
              label={
                tokenLabel
                  ? `Usage & tokens (${tokenLabel})`
                  : "Usage & tokens"
              }
              testId="settings-menu-usage"
              onClick={() => {
                onOpenPricing();
                close();
              }}
            />
            {showBilling && (
              <SettingsMenuItem
                icon={<CreditCard className="h-4 w-4" />}
                label="Manage billing"
                onClick={() => {
                  void onOpenPortal();
                  close();
                }}
              />
            )}
            <SettingsMenuItem
              icon={<ExternalLink className="h-4 w-4" />}
              label="Full pricing & features"
              onClick={() => {
                onOpenFullPricingTab();
                close();
              }}
            />
          </div>

          <div className="mx-3 border-t border-border" />

          <div className="px-sm py-xs">
            <p className="px-1 pb-1 text-meta font-semibold uppercase tracking-wider text-muted-foreground">
              App
            </p>
            <SettingsMenuItem
              icon={<Save className="h-4 w-4" />}
              label="Mixer presets"
              onClick={() => {
                onOpenPresets();
                close();
              }}
            />
            <SettingsMenuItem
              icon={<HelpCircle className="h-4 w-4" />}
              label="Keyboard shortcuts"
              onClick={() => {
                onOpenHelp();
                close();
              }}
            />
            <SettingsMenuItem
              icon={<Sparkles className="h-4 w-4" />}
              label="Restart guided tour"
              onClick={() => {
                onRestartTour();
                close();
              }}
            />
            <SettingsMenuItem
              icon={<MessageSquarePlus className="h-4 w-4" />}
              label="Send feedback"
              onClick={() => {
                onOpenFeedback();
                close();
              }}
            />
            <SettingsMenuItem
              icon={<Scale className="h-4 w-4" />}
              label="Legal & privacy"
              onClick={() => {
                onOpenLegal();
                close();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsMenuItem({
  icon,
  label,
  testId,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  testId?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "flex min-h-[44px] w-full items-center gap-sm rounded-lg px-sm py-sm text-left text-sm transition hover:bg-muted tap-feedback",
        active ? "bg-primary-500/15 text-primary-100" : "text-secondary-foreground",
      )}
    >
      <span className="opacity-70">{icon}</span>
      <span className="flex-1">{label}</span>
      {active && (
        <span className="text-meta font-medium uppercase tracking-wide text-primary-300/80">
          Open
        </span>
      )}
    </button>
  );
}
