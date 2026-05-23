import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Zap, ShieldCheck, AudioWaveform } from "lucide-react";
import type { PlanConfig, PricingTableType } from "../data/plans";
import { PricingTablePreview } from "../components/PricingTablePreview";
import { PricingTabToggle } from "../components/PricingTabToggle";
import { BillingRules } from "../components/BillingRules";
import { trackEvent } from "../analytics/events";
import {
  brandHeroContainer,
  brandHeroItemVariants,
  brandScrollSection,
} from "../motion/brandPresets";

export function LandingPage() {
  const { isSignedIn } = useAuth();
  const reduceMotion = useReducedMotion() ?? false;
  const [pricingTab, setPricingTab] = useState<PricingTableType>("subscriptions");

  const renderPricingCTA = (plan: PlanConfig) => (
    <SignUpButton mode="modal" fallbackRedirectUrl="/app">
      <button
        type="button"
        onClick={() => {
          window.sessionStorage.setItem(
            "burntbeats_post_signup_plan",
            String(plan.id),
          );
          trackEvent("landing_plan_intent_captured", {
            plan: String(plan.id),
            source: "landing_pricing",
          });
        }}
        className="w-full rounded-lg border border-primary-400/30 bg-primary-500/20 px-md py-sm font-medium text-primary-200 transition hover:border-primary-400/50 hover:bg-primary-500/30"
      >
        {plan.cta}
      </button>
    </SignUpButton>
  );

  useEffect(() => {
    if (window.location.search.includes("checkout=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (isSignedIn) return null;

  const heroItem = brandHeroItemVariants(reduceMotion);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="viewport-thermal-edge viewport-thermal-edge--fire" />
        <div className="viewport-thermal-edge viewport-thermal-edge--ice" />
        <div className="fire-orb left-[-10rem] top-[-8rem] h-96 w-96" />
        <div className="fire-orb left-[-5rem] bottom-[12%] h-[22rem] w-[22rem] opacity-50" />
        <div className="ice-orb right-[-12rem] top-16 h-[28rem] w-[28rem] opacity-70" />
        <div className="ice-orb right-[-7rem] bottom-[-12rem] h-[24rem] w-[24rem] opacity-48" />
        <div
          className="fire-orb bottom-[-14rem] left-1/3 h-[32rem] w-[32rem] opacity-25"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.32), rgba(120, 60, 200, 0.16) 30%, transparent 65%)",
          }}
        />
        <div className="circuit-mesh" />
        <div className="circuit-mesh-industrial" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto max-w-5xl px-md sm:px-lg lg:px-xl">
        <nav className="flex flex-wrap items-center justify-between gap-sm py-lg">
          <div className="flex items-center gap-sm">
            <img
              src="/logo-emblem.png"
              alt=""
              className="logo-emblem h-10 w-10 sm:h-12 sm:w-12"
              aria-hidden="true"
            />
            <div className="logo-burnt">
              <span className="logo-burnt-fire text-2xl">Burnt Beats</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-xs sm:gap-sm">
            <SignInButton mode="modal">
              <button
                type="button"
                className="ghost-button px-md py-xs text-xs sm:px-lg sm:text-sm"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="fire-button px-md py-xs text-xs sm:px-lg sm:text-sm"
              >
                Get started
              </button>
            </SignUpButton>
          </div>
        </nav>

        {/* Hero — one orchestrated entrance */}
        <motion.section
          className="flex flex-col items-center gap-lg py-12 text-center"
          {...brandHeroContainer(reduceMotion)}
        >
          <motion.div
            variants={heroItem}
            className="inline-flex max-w-full flex-wrap items-center justify-center gap-xs rounded-full border border-border bg-muted px-md py-xs text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-100/90 sm:text-xs sm:tracking-[0.3em]"
          >
            Stem Splitter · Mixer · Master
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
          </motion.div>

          <motion.div variants={heroItem}>
            <img
              src="/logo-emblem.png"
              alt=""
              className="logo-emblem mx-auto h-20 w-20 sm:h-24 sm:w-24"
              aria-hidden="true"
            />
          </motion.div>

          <motion.h1
            variants={heroItem}
            className="logo-burnt max-w-4xl text-6xl font-bold leading-tight sm:text-7xl lg:text-8xl"
          >
            <span className="logo-burnt-fire">Burnt Beats</span>
          </motion.h1>

          <motion.p
            variants={heroItem}
            className="max-w-xl break-words text-lg leading-relaxed text-secondary-foreground sm:text-xl"
          >
            High-fidelity stem separation for producers. Level, trim, and export
            radio-ready mixes in minutes.
          </motion.p>

          <motion.div
            variants={heroItem}
            className="mt-md flex flex-col items-center gap-md sm:flex-row"
          >
            <SignUpButton mode="modal">
              <button
                type="button"
                className="fire-button tap-feedback text-xl px-12 py-lg font-bold"
              >
                Try for Free
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button
                type="button"
                className="ghost-button tap-feedback text-sm px-lg py-md"
              >
                Sign In
              </button>
            </SignInButton>
          </motion.div>

          <motion.p variants={heroItem} className="text-xs text-muted-foreground">
            Secure Stripe billing · cancel anytime · one-time packs available
          </motion.p>

          <motion.div
            variants={heroItem}
            className="flex flex-col items-center gap-lg text-xs text-muted-foreground sm:flex-row"
          >
            <div className="flex items-center gap-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-success-500/70" />
              No Install Required
            </div>
            <div className="flex items-center gap-xs">
              <Zap className="h-3.5 w-3.5 text-primary-500/70" />
              60s Free Sample
            </div>
            <div className="flex items-center gap-xs">
              <AudioWaveform className="h-3.5 w-3.5 text-blue-500/70" />
              Pro Mixer & Editor
            </div>
          </motion.div>
        </motion.section>

        <motion.section id="pricing" className="py-12" {...brandScrollSection(reduceMotion)}>
          <div className="mb-8 text-center">
            <p className="eyebrow mb-xs">Simple Pricing</p>
            <p className="text-base leading-relaxed text-secondary-foreground">
              Choose a plan or buy a one-time pack. Cancel anytime.
            </p>
          </div>

          <div className="mb-lg flex justify-center">
            <PricingTabToggle activeTab={pricingTab} onTabChange={setPricingTab} />
          </div>

          <div className="glass-panel rounded-2xl border border-border p-md sm:p-lg">
            <BillingRules className="mb-md" />
            <PricingTablePreview
              pricingType={pricingTab}
              ctaButtonRenderer={renderPricingCTA}
            />
          </div>

          <div className="mt-10 grid gap-md text-left text-base leading-relaxed text-secondary-foreground sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-secondary p-md">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
                Will this work on my laptop?
              </p>
              <p>
                Yes. Burnt Beats is tuned for CPU-friendly processing — no GPU
                or special hardware required. If you can stream music, you can
                split stems.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary p-md">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
                How do tokens map to songs?
              </p>
              <p className="break-words">
                1 token = 1 minute of audio. A 3‑minute track costs 3 tokens to
                split, and another 3 if you expand to 4 stems. Partial minutes
                round up, so you always know the cost upfront.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary p-md">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
                Can I cancel or change plans?
              </p>
              <p>
                Absolutely. Manage everything through Stripe — upgrade,
                downgrade, or cancel with a couple of clicks. No emails or phone
                calls required.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary p-md">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
                Do I have to subscribe?
              </p>
              <p>
                No. If you only need stems occasionally, you can use the Top‑Up
                pack to buy a one‑time block of tokens instead of a monthly
                plan.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary p-md">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
                What is The Waiting Game?
              </p>
              <p>
                A lightweight mini-game inside the app to pass time while stems
                are processing. Open it from the bottom-right tab during split
                progress.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="glass-panel mirror-sheen mb-16 rounded-[2rem] px-md py-10 text-center sm:px-xl sm:py-12"
          {...brandScrollSection(reduceMotion, 0.08)}
        >
          <p className="mb-xs text-2xl font-bold text-secondary-foreground">
            Ready to split?
          </p>
          <p className="mb-8 text-base text-secondary-foreground">
            Create an account and start separating stems in seconds.
          </p>
          <SignUpButton mode="modal">
            <button
              type="button"
              className="fire-button tap-feedback text-base px-xl py-md"
            >
              Create free account
            </button>
          </SignUpButton>
        </motion.section>

        <footer className="border-t border-border py-xl text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Burnt Beats. All rights reserved.</p>
          <nav
            aria-label="Footer links"
            className="mt-sm flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
          >
            <a
              href="/terms-of-service"
              className="text-muted-foreground underline decoration-white/20 underline-offset-2 transition hover:text-primary-200/90"
            >
              Terms of Service
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="/privacy-policy"
              className="text-muted-foreground underline decoration-white/20 underline-offset-2 transition hover:text-primary-200/90"
            >
              Privacy Policy
            </a>
            {typeof import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL ===
              "string" &&
              import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL.startsWith(
                "http",
              ) && (
                <>
                  <span aria-hidden="true">·</span>
                  <a
                    href={import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground underline decoration-white/20 underline-offset-2 transition hover:text-primary-200/90"
                  >
                    Manage billing
                  </a>
                </>
              )}
          </nav>
        </footer>
      </div>
    </div>
  );
}
