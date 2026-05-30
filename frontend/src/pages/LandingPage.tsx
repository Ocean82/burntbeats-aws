import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, Library, Piano } from "lucide-react";
import { WorkflowStepper } from "../components/ui";
import { StemLaneGhostPreview } from "../components/editor/StemLaneGhostPreview";
import { EDITOR_WORKFLOW_STEPS } from "../hooks/workflow/useEditorWorkflowSteps";
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
        className="fire-button tap-feedback w-full px-md py-sm text-sm font-semibold"
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

        {/* Hero — ignition sequence */}
        <motion.section
          className="relative flex w-full flex-col items-stretch gap-xl py-[clamp(3rem,8vw,6rem)] text-center"
          {...brandHeroContainer(reduceMotion)}
        >
          <motion.div
            variants={heroItem}
            className="inline-flex max-w-full flex-wrap items-center justify-center gap-xs rounded-full border border-border bg-muted px-md py-xs text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-100/90 sm:text-xs sm:tracking-[0.3em]"
          >
            Browser workstation for producers and DJs
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
          </motion.div>

          <motion.div variants={heroItem}>
            <img
              src="/logo-emblem.png"
              alt=""
              className="logo-emblem mx-auto h-16 w-16 sm:h-20 sm:w-20"
              aria-hidden="true"
            />
          </motion.div>

          <motion.h1
            variants={heroItem}
            className="logo-burnt mx-auto w-full max-w-5xl text-[clamp(3.5rem,10vw,8rem)] font-bold leading-[0.92] tracking-[-0.05em]"
          >
            <span className="logo-burnt-fire">Burnt Beats</span>
          </motion.h1>

          <motion.p
            variants={heroItem}
            className="mx-auto w-full max-w-2xl text-pretty text-[clamp(1rem,2.5vw,1.25rem)] font-light leading-relaxed text-secondary-foreground"
          >
            Burnt Beats is the browser workstation for producers and DJs who
            need more than isolated files. Split tracks into stems, shape the
            mix in-browser, reopen past jobs from your library, and move
            straight into MIDI or export.
          </motion.p>

          <motion.div
            variants={heroItem}
            className="mt-lg flex flex-col items-center gap-md sm:flex-row"
          >
            <SignUpButton mode="modal">
              <button
                type="button"
                className="fire-button tap-feedback text-[clamp(1.1rem,2.5vw,1.35rem)] px-[clamp(2rem,5vw,3.5rem)] py-[clamp(1rem,2vw,1.4rem)] font-bold"
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

          <motion.div variants={heroItem} className="mt-lg w-full max-w-lg px-md">
            <WorkflowStepper
              steps={[...EDITOR_WORKFLOW_STEPS]}
              activeStepId="upload"
              completedStepIds={[]}
            />
          </motion.div>

          <motion.div
            variants={heroItem}
            className="mt-md w-full max-w-md"
            aria-hidden="true"
          >
            <StemLaneGhostPreview variant="hero" />
          </motion.div>

          {/* Proof strip */}
          <motion.div
            variants={heroItem}
            className="mt-lg flex flex-col items-center gap-md sm:flex-row sm:gap-xl"
          >
            <div className="flex items-center gap-xs text-sm font-medium text-secondary-foreground">
              <ShieldCheck className="h-4 w-4 text-success-500/80" aria-hidden="true" />
              No install required
            </div>
            <div className="flex items-center gap-xs text-sm font-medium text-secondary-foreground">
              <Library className="h-4 w-4 text-primary-500/80" aria-hidden="true" />
              Reopen past stem jobs
            </div>
            <div className="flex items-center gap-xs text-sm font-medium text-secondary-foreground">
              <Piano className="h-4 w-4 text-midi-gold/80" aria-hidden="true" />
              Stem-to-MIDI workflow built in
            </div>
          </motion.div>

          <motion.p variants={heroItem} className="text-xs text-muted-foreground/70">
            Secure Stripe billing · cancel anytime · one-time packs available
          </motion.p>
        </motion.section>

        <motion.section
          className="grid gap-md py-[clamp(2rem,5vw,4rem)] text-left sm:grid-cols-2 md:gap-lg"
          {...brandScrollSection(reduceMotion)}
        >
          {/** Header spans full width */}
          <div className="sm:col-span-2 min-w-0">
            <p className="eyebrow mb-sm">Why Burnt Beats is different</p>
            <p className="max-w-3xl font-display text-[clamp(1.25rem,3vw,1.9rem)] font-bold leading-tight text-secondary-foreground">
              Most stem splitters stop at the download. Burnt Beats keeps the
              workflow moving.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
            <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
              In-browser mixer and editor
            </p>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              After the split, you can level, trim, and shape the result without
              immediately bouncing into another tool.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
            <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
              Reopen past stem jobs
            </p>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              Your splits are not disposable downloads. Return to old jobs from
              My Stems and keep working from the same library.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
            <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
              Stem-to-MIDI workflow built in
            </p>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              Move from separated audio into MIDI conversion inside the same
              product instead of breaking your workflow across multiple apps.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
            <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
              Built for producers and DJs
            </p>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              Burnt Beats is designed like a lightweight browser workstation,
              not a one-click converter. The value is in the workflow, not just
              the split.
            </p>
          </div>
        </motion.section>

        <motion.section id="pricing" className="py-[clamp(3rem,6vw,5rem)]" {...brandScrollSection(reduceMotion)}>
          <div className="mb-10 text-center">
            <p className="eyebrow mb-sm">Pricing</p>
            <p className="font-display text-[clamp(1.25rem,3vw,1.75rem)] font-bold leading-tight text-secondary-foreground">
              Choose a plan or buy a one-time pack
            </p>
            <p className="mt-xs text-sm text-muted-foreground">
              Monthly plans fit repeat workflow. Packs keep the workstation open
              for occasional sessions.
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

          <div className="mt-12 grid gap-md text-left sm:grid-cols-2 md:gap-lg">
            <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
              <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
                Why producers pay for more than the split
              </p>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                Burnt Beats is not just a file drop. You can split a track, keep
                working in the browser, shape the mix, and export without
                treating the separation step like a dead end.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
              <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
                What happens after the split?
              </p>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                Your work does not vanish into a downloads folder. Reopen past
                stem jobs from My Stems, return to earlier projects, and keep
                building from the same library.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
              <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
                Can I turn stems into MIDI?
              </p>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                Yes. Burnt Beats includes a stem-to-MIDI workflow so you can move
                from separated audio into note data without breaking the session
                across multiple tools.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
              <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
                Will this work on my laptop?
              </p>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                Yes. Burnt Beats runs in your browser with CPU-based
                processing, so you do not need a GPU, a plugin install, or a
                dedicated production machine to use it.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
              <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
                How do tokens map to songs?
              </p>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                1 token = 1 minute of audio. A 3-minute track costs 3 tokens to
                run in either 2-stem or 4-stem mode, depending on the split you
                choose. Partial minutes round up.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/60 p-lg min-w-0">
              <p className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
                Do I have to subscribe?
              </p>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                No. If you only need stems occasionally, buy a one-time Top-Up
                pack instead of a monthly plan. Subscribe when Burnt Beats
                becomes part of your regular workflow.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="glass-panel mirror-sheen relative mb-16 overflow-hidden rounded-[2rem] px-md py-[clamp(3rem,6vw,5rem)] text-center sm:px-xl"
          {...brandScrollSection(reduceMotion, 0.08)}
        >
          {/* Thermal glow behind CTA */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 80%, rgba(255, 60, 10, 0.18), transparent 60%)",
            }}
          />
          <p className="relative mb-xs font-display text-[clamp(1.5rem,4vw,2.5rem)] font-bold leading-tight text-secondary-foreground">
            Ready to build your first stem workflow?
          </p>
          <p className="relative mb-10 text-base text-secondary-foreground/80">
            Create an account, split your first track, and keep working inside
            the same browser session.
          </p>
          <SignUpButton mode="modal">
            <button
              type="button"
              className="fire-button tap-feedback relative text-[clamp(1rem,2vw,1.2rem)] px-[clamp(2rem,4vw,3rem)] py-[clamp(0.9rem,2vw,1.2rem)] font-bold"
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
