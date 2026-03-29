import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Mic2, Layers, Sliders, Download, Zap, Music2 } from "lucide-react";
import { StripePricingTableEmbed } from "../components/StripePricingTableEmbed";

const FEATURES = [
  {
    icon: Mic2,
    title: "Stem Separation",
    desc: "Split any track into vocals, drums, bass, and melody — tuned for CPU-friendly processing.",
  },
  {
    icon: Layers,
    title: "2-stem or 4-stem",
    desc: "Start with vocals + instrumental, then expand to full 4-stem with one click.",
  },
  {
    icon: Sliders,
    title: "Pro Mixer",
    desc: "Trim, level, and pan each stem independently with undo/redo.",
  },
  {
    icon: Download,
    title: "Flexible Export",
    desc: "Export your master mix or individual stems as WAV. Batch queue multiple tracks.",
  },
  {
    icon: Zap,
    title: "Three Quality Modes",
    desc: "Fast for quick previews, Balanced for everyday work, and Quality for the best separation.",
  },
  {
    icon: Music2,
    title: "Load & Mashup",
    desc: "Load stems from other projects and mix them together in the same session.",
  },
];

export function LandingPage() {
  const { isSignedIn } = useAuth();

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
        <nav className="flex items-center justify-between py-6">
          <div className="logo-burnt">
            <span className="logo-burnt-fire text-2xl">Burnt Beats</span>
          </div>
          <div className="flex items-center gap-3">
            <SignInButton mode="modal">
              <button type="button" className="ghost-button text-sm px-5 py-2">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="fire-button text-sm px-5 py-2">
                Get started
              </button>
            </SignUpButton>
          </div>
        </nav>

        {/* Hero */}
        <motion.section
          className="flex flex-col items-center gap-8 py-20 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-100/80">
            Stem Splitter · Mixer · Master
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
          </div>

          <h1 className="logo-burnt max-w-3xl text-5xl sm:text-6xl lg:text-7xl leading-tight">
            <span className="logo-burnt-fire">Burnt Beats</span>
          </h1>

          <p className="max-w-xl text-base leading-7 text-white/65 sm:text-lg">
            Split any track into stems, mix with pro controls, and export — all in your browser. No plugins, no installs.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <SignUpButton mode="modal">
              <button type="button" className="fire-button text-base px-8 py-4">
                Start splitting free
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button type="button" className="ghost-button text-sm px-6 py-3.5">
                Already have an account
              </button>
            </SignInButton>
          </div>

          {/* Mini demo badge */}
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span className="status-light" />
            CPU-optimised · No GPU required · Cancel anytime
          </div>
        </motion.section>

        {/* Features */}
        <motion.section
          className="py-16"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <p className="eyebrow mb-10 text-center">What you get</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-card rounded-2xl p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <f.icon className="h-4 w-4 text-amber-300/80" />
                </div>
                <p className="mb-1 text-sm font-semibold text-white/90">{f.title}</p>
                <p className="text-xs leading-5 text-white/50">{f.desc}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Pricing — Stripe hosted pricing table */}
        <motion.section
          className="py-16"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          <p className="eyebrow mb-2 text-center">Pricing</p>
          <p className="mb-10 text-center text-sm text-white/50">Simple plans. Cancel anytime.</p>

          <div className="glass-panel rounded-2xl border border-white/10 p-4 sm:p-6">
            <StripePricingTableEmbed />
          </div>
        </motion.section>

        {/* Footer CTA */}
        <motion.section
          className="glass-panel mirror-sheen mb-16 rounded-[2rem] px-8 py-12 text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          <p className="mb-2 text-2xl font-bold text-white/90">Ready to split?</p>
          <p className="mb-8 text-sm text-white/50">Create an account and start separating stems in seconds.</p>
          <SignUpButton mode="modal">
            <button type="button" className="fire-button text-base px-8 py-4">
              Create free account
            </button>
          </SignUpButton>
        </motion.section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-8 text-center text-xs text-white/30">
          <p>© {new Date().getFullYear()} Burnt Beats. All rights reserved.</p>
          {typeof import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL === "string" &&
            import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL.startsWith("http") && (
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
