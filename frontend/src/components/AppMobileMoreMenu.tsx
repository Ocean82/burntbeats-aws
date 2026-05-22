import { useEffect, useRef, useState } from "react";
import { Menu, Save, HelpCircle, MessageSquarePlus, Coins, Sparkles, Scale, X } from "lucide-react";
import { cn } from "../utils/cn";

export interface AppMobileMoreMenuProps {
  onOpenPricing: () => void;
  onOpenFullPricingTab: () => void;
  onOpenPortal: () => void;
  onOpenPresets: () => void;
  onOpenHelp: () => void;
  onOpenUsage: () => void;
  onOpenFeedback: () => void;
  onRestartTour: () => void;
  onOpenLegal: () => void;
  pricingLabel: string;
  pricingTitle: string;
  showBilling: boolean;
  usageSummary?: string;
}

/**
 * Collapses secondary header actions behind a “More” control on narrow viewports (lg breakpoint).
 */
export function AppMobileMoreMenu({
  onOpenPricing,
  onOpenFullPricingTab,
  onOpenPortal,
  onOpenPresets,
  onOpenHelp,
  onOpenUsage,
  onOpenFeedback,
  onRestartTour,
  onOpenLegal,
  pricingLabel,
  pricingTitle,
  showBilling,
  usageSummary,
}: AppMobileMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = "app-mobile-more-menu";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div className="relative lg:hidden" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border bg-muted text-secondary-foreground transition hover:text-foreground tap-feedback",
          open && "border-primary-400/50 bg-primary-500/15 text-primary-100",
        )}
        aria-haspopup="true"
        aria-controls={menuId}
        aria-label={open ? "Close menu" : "More actions"}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-dropdown mt-xs w-56 max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-popover/98 py-1 shadow-elevation-lg backdrop-blur-md"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
            onClick={() => {
              onOpenFullPricingTab();
              setOpen(false);
            }}
          >
            Full pricing &amp; features
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
            onClick={() => {
              onOpenPricing();
              setOpen(false);
            }}
            title={pricingTitle}
          >
            {pricingLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
            onClick={() => {
              onOpenUsage();
              setOpen(false);
            }}
          >
            <Coins className="h-4 w-4 opacity-70" />
            {usageSummary ? `Usage & tokens (${usageSummary})` : "Usage & tokens"}
          </button>
          {showBilling && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
              onClick={() => {
                void onOpenPortal();
                setOpen(false);
              }}
            >
              Billing
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
            onClick={() => {
              onOpenPresets();
              setOpen(false);
            }}
          >
            <Save className="h-4 w-4 opacity-70" />
            Presets
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
            onClick={() => {
              onOpenHelp();
              setOpen(false);
            }}
          >
            <HelpCircle className="h-4 w-4 opacity-70" />
            Keyboard shortcuts
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
            onClick={() => {
              onRestartTour();
              setOpen(false);
            }}
          >
            <Sparkles className="h-4 w-4 opacity-70" />
            Restart guided tour
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
            onClick={() => {
              onOpenFeedback();
              setOpen(false);
            }}
          >
            <MessageSquarePlus className="h-4 w-4 opacity-70" />
            Send feedback
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-xs px-md py-sm text-left text-sm text-secondary-foreground hover:bg-muted"
            onClick={() => {
              onOpenLegal();
              setOpen(false);
            }}
          >
            <Scale className="h-4 w-4 opacity-70" />
            Legal & privacy
          </button>
        </div>
      )}
    </div>
  );
}
