import { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://js.stripe.com/v3/pricing-table.js";

function loadStripePricingTableScript(): Promise<void> {
  if (typeof customElements !== "undefined" && customElements.get("stripe-pricing-table")) {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (customElements.get("stripe-pricing-table")) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Stripe pricing table script failed")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Stripe pricing table script failed"));
    document.head.appendChild(s);
  });
}

export interface StripePricingTableEmbedProps {
  /** Falls back to `import.meta.env.VITE_STRIPE_PRICING_TABLE_ID` */
  pricingTableId?: string;
  /** Falls back to `import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY` */
  publishableKey?: string;
}

/**
 * Embeds Stripe’s hosted pricing table (https://stripe.com/docs/payments/checkout/pricing-table).
 * Requires VITE_STRIPE_PRICING_TABLE_ID and VITE_STRIPE_PUBLISHABLE_KEY unless passed as props.
 */
export function StripePricingTableEmbed({
  pricingTableId: pricingTableIdProp,
  publishableKey: publishableKeyProp,
}: StripePricingTableEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pricingTableId = pricingTableIdProp ?? import.meta.env.VITE_STRIPE_PRICING_TABLE_ID ?? "";
  const publishableKey = publishableKeyProp ?? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";

  useEffect(() => {
    if (!pricingTableId || !publishableKey) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    let cancelled = false;
    let el: HTMLElement | null = null;

    (async () => {
      try {
        await loadStripePricingTableScript();
        if (cancelled || !containerRef.current) return;
        await customElements.whenDefined("stripe-pricing-table");
        if (cancelled || !containerRef.current) return;
        el = document.createElement("stripe-pricing-table");
        el.setAttribute("pricing-table-id", pricingTableId);
        el.setAttribute("publishable-key", publishableKey);
        containerRef.current.appendChild(el);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      }
    })();

    return () => {
      cancelled = true;
      if (el?.parentNode) el.parentNode.removeChild(el);
    };
  }, [pricingTableId, publishableKey]);

  if (!pricingTableId || !publishableKey) {
    return (
      <p className="break-words px-2 text-center text-sm text-amber-200/80">
        Set <code className="rounded bg-white/10 px-1">VITE_STRIPE_PRICING_TABLE_ID</code> and{" "}
        <code className="rounded bg-white/10 px-1">VITE_STRIPE_PUBLISHABLE_KEY</code> in{" "}
        <code className="rounded bg-white/10 px-1">frontend/.env</code> to show live pricing.
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div ref={containerRef} className="stripe-pricing-table-host min-h-[420px] w-full min-w-[280px]" />
    </div>
  );
}
