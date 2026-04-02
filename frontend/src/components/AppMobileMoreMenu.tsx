import { useEffect, useRef, useState } from "react";
import { Menu, Save, HelpCircle, X } from "lucide-react";
import { cn } from "../utils/cn";

export interface AppMobileMoreMenuProps {
  onOpenPricing: () => void;
  onOpenFullPricingTab: () => void;
  onOpenPortal: () => void;
  onOpenPresets: () => void;
  onOpenHelp: () => void;
  pricingLabel: string;
  pricingTitle: string;
  showBilling: boolean;
  isPricingView: boolean;
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
  pricingLabel,
  pricingTitle,
  showBilling,
  isPricingView,
}: AppMobileMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative lg:hidden" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/15 bg-black/20 text-white/75 transition hover:text-white tap-feedback",
          open && "border-amber-400/50 bg-amber-500/15 text-amber-100",
        )}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={open ? "Close menu" : "More actions"}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-white/15 bg-[#14100e]/98 py-1 shadow-xl backdrop-blur-md"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-white/85 hover:bg-white/10"
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
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-white/85 hover:bg-white/10"
            onClick={() => {
              onOpenPricing();
              setOpen(false);
            }}
            title={pricingTitle}
          >
            {isPricingView ? "Back to editor" : pricingLabel}
          </button>
          {showBilling && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-white/85 hover:bg-white/10"
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
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-white/85 hover:bg-white/10"
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
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-white/85 hover:bg-white/10"
            onClick={() => {
              onOpenHelp();
              setOpen(false);
            }}
          >
            <HelpCircle className="h-4 w-4 opacity-70" />
            Keyboard shortcuts
          </button>
        </div>
      )}
    </div>
  );
}
