import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { BillingRules } from "../BillingRules";
import { PricingFeatureComparison } from "../PricingFeatureComparison";
import { PricingTablePreview } from "../PricingTablePreview";
import { PricingTabToggle } from "../PricingTabToggle";
import type { PlanConfig, PricingTableType } from "../../data/plans";
import { brandScrollSection } from "../../motion/brandPresets";

const PRICING_FAQ = [
  {
    title: "Why producers pay for more than the split",
    body:
      "Burnt Beats is not just a file drop. You can split a track, keep working in the browser, shape the mix, and export without treating the separation step like a dead end.",
  },
  {
    title: "What happens after the split?",
    body:
      "Your work does not vanish into a downloads folder. Reopen past stem jobs from My Stems, return to earlier projects, and keep building in the same session.",
  },
  {
    title: "Can I turn stems into MIDI?",
    body:
      "Yes. Burnt Beats includes a stem-to-MIDI workflow so you can move from separated audio into note data without breaking the session across multiple tools.",
  },
  {
    title: "Will this work on my laptop?",
    body:
      "Yes. Burnt Beats runs in your browser with CPU-based processing, so you do not need a GPU, a plugin install, or a dedicated production machine to use it.",
  },
  {
    title: "How do tokens map to songs?",
    body:
      "1 token = 1 minute of audio. A 3-minute track costs 3 tokens to split. Speech cleanup and MIDI conversion also use tokens. Mixer edits and browser export are free. Unused monthly tokens roll over. Partial minutes round up.",
  },
  {
    title: "What tools are included?",
    body:
      "Paid access unlocks the full workstation: stem separation, waveform mixer, multi-stem editor, WAV/MP3 export, audio-to-MIDI, vocal cleanup, beat maker, and job history — not just a download link.",
  },
  {
    title: "Do I have to subscribe?",
    body:
      "No. Start with a $0.99 Single Song pack or a $5 Top-Up (60 minutes). Subscribe to Premium ($15/mo) when you want 4-stem splits, quality modes, batch queue, and the best per-minute value.",
  },
] as const;

interface LandingPricingSectionProps {
  pricingTab: PricingTableType;
  onPricingTabChange: (tab: PricingTableType) => void;
  renderPricingCTA: (plan: PlanConfig) => ReactNode;
}

export function LandingPricingSection({
  pricingTab,
  onPricingTabChange,
  renderPricingCTA,
}: LandingPricingSectionProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.section
      id="pricing"
      aria-labelledby="landing-pricing-title"
      className="w-full py-[clamp(3rem,6vw,5rem)]"
      {...brandScrollSection(reduceMotion)}
    >
      <div className="mb-10 w-full text-center">
        <h2
          id="landing-pricing-title"
          className="font-display text-center text-[clamp(1.25rem,3vw,1.75rem)] font-bold leading-tight text-secondary-foreground"
        >
          Choose a plan or buy a one-time pack
        </h2>
        <p className="mx-auto mt-xs max-w-xl text-center text-sm text-muted-foreground">
          Monthly plans fit repeat workflow. Packs keep the workstation open for
          occasional sessions.
        </p>
      </div>

      <div className="mb-lg flex flex-col items-center gap-sm">
        <PricingTabToggle
          activeTab={pricingTab}
          onTabChange={onPricingTabChange}
        />
        {pricingTab === "subscriptions" && (
          <button
            type="button"
            onClick={() => onPricingTabChange("packs")}
            className="text-xs text-muted-foreground transition hover:text-primary-200"
          >
            Just need one track? Packs start at <span className="font-semibold text-primary-200">$0.99</span> →
          </button>
        )}
      </div>

      <div className="glass-panel rounded-2xl border border-border p-md sm:p-lg">
        <BillingRules className="mb-md" />
        <PricingTablePreview
          pricingType={pricingTab}
          heroOnly={false}
          billingInterval="year"
          ctaButtonRenderer={renderPricingCTA}
        />
        <div className="mt-lg">
          <PricingFeatureComparison hideStudio={false} />
        </div>
      </div>

      <div className="mt-12 w-full">
        <h3 className="mb-md font-display text-sm font-bold text-secondary-foreground">
          Common questions
        </h3>
        <div className="divide-y divide-border rounded-2xl border border-border bg-secondary/40">
          {PRICING_FAQ.map((item) => (
            <details
              key={item.title}
              className="group"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-sm px-lg py-md text-sm font-semibold text-secondary-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span>{item.title}</span>
                <svg
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </summary>
              <div className="px-lg pb-md text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </div>
            </details>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
