import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Zap,
  ShieldCheck,
  AudioWaveform,
} from "lucide-react";
import { StripePricingTableEmbed } from "../components/StripePricingTableEmbed";


export function LandingPage() {
  const { isSignedIn } = useAuth();
  const reduceMotion = useReducedMotion();
  const [pricingTab, setPricingTab] = useState<"subscriptions" | "packs">(
    "subscriptions",
  );
  /** Framer entrance: skip motion when user prefers reduced motion. */
  const fadeUp = (delay = 0, y: 16 | 20 = 16) =>
    reduceMotion
      ? {
          initial: false as const,
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0 },
        }
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay },
        };

  // Clerk modal sign-in sets isSignedIn → Root re-renders and swaps to App automatically.
  // Nothing extra needed here — Root handles the switch.
  useEffect(() => {
    // Clean up ?checkout= query param if user lands back here after cancelling
    if (window.location.search.includes("checkout=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Already signed in — Root will swap us out, render nothing to avoid flash
  if (isSignedIn) return null;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      {/* Background orbs — same as main app */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Nav */}
        <nav className="flex flex-wrap items-center justify-between gap-3 py-6">
          <div className="logo-burnt">
            <span className="logo-burnt-fire text-2xl">Burnt Beats</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <SignInButton mode="modal">
              <button
                type="button"
                className="ghost-button px-4 py-2 text-xs sm:px-5 sm:text-sm"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="fire-button px-4 py-2 text-xs sm:px-5 sm:text-sm"
              >
                Get started
              </button>
            </SignUpButton>
          </div>
        </nav>

        {/* Hero */}
        <motion.section
          className="flex flex-col items-center gap-6 py-12 text-center"
          {...fadeUp(0, 20)}
        >
          <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/90 sm:text-xs sm:tracking-[0.3em]">
            Stem Splitter · Mixer · Master
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
          </div>

          <h1 className="logo-burnt max-w-4xl text-6xl font-bold leading-tight sm:text-7xl lg:text-8xl">
            <span className="logo-burnt-fire">Burnt Beats</span>
          </h1>

          <p className="max-w-xl break-words text-lg leading-relaxed text-white/90 sm:text-xl">
            High-fidelity stem separation for producers. Level, trim, and export
            radio-ready mixes in minutes.
          </p>

          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
            <SignUpButton mode="modal">
              <button
                type="button"
                className="fire-button tap-feedback text-xl px-12 py-5 font-bold"
              >
                Try for Free
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button
                type="button"
                className="ghost-button tap-feedback text-sm px-6 py-4"
              >
                Sign In
              </button>
            </SignInButton>
          </div>

          <div className="flex flex-col items-center gap-6 text-xs text-white/50 sm:flex-row">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70" />
              No Install Required
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-500/70" />
              60s Free Sample
            </div>
            <div className="flex items-center gap-2">
              <AudioWaveform className="h-3.5 w-3.5 text-blue-500/70" />
              Pro Mixer & Editor
            </div>
          </div>
        </motion.section>

        {/* Pricing — Stripe hosted pricing table */}
        <motion.section id="pricing" className="py-12" {...fadeUp(0.15)}>
          <div className="mb-8 text-center">
            <p className="eyebrow mb-2">Simple Pricing</p>
            <p className="text-base leading-relaxed text-white/75">
              Choose a plan or buy a one-time pack. Cancel anytime.
            </p>
          </div>

          <div className="mb-6 flex justify-center">
            <div className="flex w-fit rounded-lg border border-white/10 bg-black/40 p-1">
              <button
                onClick={() => setPricingTab("subscriptions")}
                className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
                  pricingTab === "subscriptions"
                    ? "bg-amber-400/20 text-amber-200"
                    : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                Subscriptions
              </button>
              <button
                onClick={() => setPricingTab("packs")}
                className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
                  pricingTab === "packs"
                    ? "bg-amber-400/20 text-amber-200"
                    : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                Credit Packs
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-2xl border border-white/10 p-4 sm:p-6">
            <StripePricingTableEmbed
              pricingTableId={
                pricingTab === "subscriptions"
                  ? import.meta.env.VITE_STRIPE_PRICING_TABLE_ID
                  : import.meta.env.VITE_STRIPE_PACKAGE_PRICING_TABLE_ID
              }
            />
          </div>

          <div className="mt-10 grid gap-4 text-left text-base leading-relaxed text-white/80 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-white/80">
                Will this work on my laptop?
              </p>
              <p>
                Yes. Burnt Beats is tuned for CPU-friendly processing — no GPU
                or special hardware required. If you can stream music, you can
                split stems.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-white/80">
                How do tokens map to songs?
              </p>
              <p className="break-words">
                1 token = 1 minute of audio. A 3‑minute track costs 3 tokens to
                split, and another 3 if you expand to 4 stems. Partial minutes
                round up, so you always know the cost upfront.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-white/80">
                Can I cancel or change plans?
              </p>
              <p>
                Absolutely. Manage everything through Stripe — upgrade,
                downgrade, or cancel with a couple of clicks. No emails or phone
                calls required.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-white/80">
                Do I have to subscribe?
              </p>
              <p>
                No. If you only need stems occasionally, you can use the Top‑Up
                pack to buy a one‑time block of tokens instead of a monthly
                plan.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Footer CTA */}
        <motion.section
          className="glass-panel mirror-sheen mb-16 rounded-[2rem] px-4 py-10 text-center sm:px-8 sm:py-12"
          {...fadeUp(0.35)}
        >
          <p className="mb-2 text-2xl font-bold text-white/90">
            Ready to split?
          </p>
          <p className="mb-8 text-base text-white/80">
            Create an account and start separating stems in seconds.
          </p>
          <SignUpButton mode="modal">
            <button
              type="button"
              className="fire-button tap-feedback text-base px-8 py-4"
            >
              Create free account
            </button>
          </SignUpButton>
        </motion.section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-8 text-center text-sm text-white/30">
          <p>© {new Date().getFullYear()} Burnt Beats. All rights reserved.</p>
          {typeof import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL ===
            "string" &&
            import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL.startsWith(
              "http",
            ) && (
              <p className="mt-3">
                <a
                  href={import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/45 underline decoration-white/20 underline-offset-2 transition hover:text-amber-200/90"
                >
                  Manage billing
                </a>
              </p>
            )}
        </footer>
      </div>
    </div>
  );
}
