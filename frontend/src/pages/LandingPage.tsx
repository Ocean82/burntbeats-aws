import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { trackEvent } from "../analytics/events";
import type { PlanConfig, PricingTableType } from "../data/plans";
import { LandingBackground } from "../components/landing/LandingBackground";
import { LandingDifferentiatorsSection } from "../components/landing/LandingDifferentiatorsSection";
import { LandingFinalCta } from "../components/landing/LandingFinalCta";
import { LandingHero } from "../components/landing/LandingHero";
import { LandingPricingSection } from "../components/landing/LandingPricingSection";
import { LandingSocialProof } from "../components/landing/LandingSocialProof";

interface LandingPageProps {
  /** Scroll to a landing section after mount (e.g. `/pricing` deep link). */
  focusSection?: "pricing";
}

export function LandingPage({ focusSection }: LandingPageProps = {}) {
  const { isSignedIn } = useAuth();
  const [pricingTab, setPricingTab] =
    useState<PricingTableType>("subscriptions");
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSection !== "pricing") return;
    const target = document.getElementById("pricing");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSection]);

  // Sticky header scroll detection via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

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
    <div className="min-h-screen scroll-pt-16 bg-(--bg) text-foreground">
      <a
        href="#landing-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-lg focus:left-lg focus:z-tooltip focus:rounded-full focus:border focus:border-primary-400/30 focus:bg-primary-500/20 focus:px-md focus:py-xs focus:text-sm focus:font-medium focus:text-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:ring-offset-2 focus:ring-offset-background"
      >
        Skip to main content
      </a>

      <LandingBackground />

      {/* Sentinel element for IntersectionObserver — triggers sticky header style */}
      <div ref={sentinelRef} className="absolute top-0 h-px w-full" aria-hidden="true" />

      {/* Full-bleed sticky header — lives outside the content container */}
      <header
        className={`sticky top-0 z-40 w-full transition-[background-color,border-color,box-shadow] duration-200 ease-out ${
          headerScrolled
            ? "border-b border-border/50 bg-background/85 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-sm px-md py-sm sm:px-lg sm:py-md lg:px-xl">
          <div className="flex items-center gap-sm">
            <img
              src="/logo-emblem.png"
              alt=""
              className="logo-emblem h-9 w-9 sm:h-10 sm:w-10"
              aria-hidden="true"
            />
            <div className="logo-burnt">
              <span className="logo-burnt-fire text-xl sm:text-2xl">Burnt Beats</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-xs sm:gap-sm">
            <a
              href="#pricing"
              className="hidden text-sm font-medium text-secondary-foreground transition hover:text-primary-200 sm:inline-block"
            >
              Pricing
            </a>
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

      <div className="relative mx-auto max-w-5xl px-md sm:px-lg lg:px-xl">
        <main id="landing-main">
          <LandingHero />
          <LandingSocialProof />
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
