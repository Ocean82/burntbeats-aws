import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { trackEvent } from "../analytics/events";
import type { PlanConfig, PricingTableType } from "../data/plans";
import { LandingBackground } from "../components/landing/LandingBackground";
import { LandingDifferentiatorsSection } from "../components/landing/LandingDifferentiatorsSection";
import { LandingFinalCta } from "../components/landing/LandingFinalCta";
import { LandingHero } from "../components/landing/LandingHero";
import { LandingPricingSection } from "../components/landing/LandingPricingSection";

interface LandingPageProps {
  /** Scroll to a landing section after mount (e.g. `/pricing` deep link). */
  focusSection?: "pricing";
}

export function LandingPage({ focusSection }: LandingPageProps = {}) {
  const { isSignedIn } = useAuth();
  const [pricingTab, setPricingTab] =
    useState<PricingTableType>("subscriptions");

  useEffect(() => {
    if (focusSection !== "pricing") return;
    const target = document.getElementById("pricing");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSection]);

  const renderPricingCTA = (plan: PlanConfig): ReactNode => (
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

  if (isSignedIn) return null;

  return (
    <div className="min-h-screen bg-(--bg) text-foreground">
      <a
        href="#landing-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-lg focus:left-lg focus:z-tooltip focus:rounded-full focus:border focus:border-primary-400/30 focus:bg-primary-500/20 focus:px-md focus:py-xs focus:text-sm focus:font-medium focus:text-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:ring-offset-2 focus:ring-offset-background"
      >
        Skip to main content
      </a>

      <LandingBackground />

      <div className="relative mx-auto max-w-5xl px-md sm:px-lg lg:px-xl">
        <header>
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
        </header>

        <main id="landing-main">
          <LandingHero />
          <LandingDifferentiatorsSection />
          <LandingPricingSection
            pricingTab={pricingTab}
            onPricingTabChange={setPricingTab}
            renderPricingCTA={renderPricingCTA}
          />
          <LandingFinalCta />
        </main>

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
