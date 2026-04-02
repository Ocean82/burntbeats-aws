import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Mic2, Layers, Sliders, Download, Zap, Music2, ShieldCheck, Users, Clock, Headphones, AudioWaveform, Guitar } from "lucide-react";
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
          <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-100/90">
            Stem Splitter · Mixer · Master
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
          </div>

          <h1 className="logo-burnt max-w-3xl text-5xl sm:text-6xl lg:text-7xl leading-tight">
            <span className="logo-burnt-fire">Burnt Beats</span>
          </h1>

          <p className="max-w-xl text-base leading-7 text-white/85 sm:text-lg">
            Turn full songs into usable stems in minutes — then level, trim, and export radio-ready mixes without plugins or installs.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <SignUpButton mode="modal">
              <button type="button" className="fire-button tap-feedback text-base px-8 py-4">
                Get started
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button type="button" className="ghost-button tap-feedback text-sm px-6 py-3.5">
                Already have an account
              </button>
            </SignInButton>
          </div>

          <button
            type="button"
            className="mt-3 text-sm text-white/75 underline underline-offset-4 hover:text-amber-200"
            onClick={() => {
              const el = document.getElementById("pricing");
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
          >
            See plans &amp; pricing
          </button>

          {/* Trust + risk reversal */}
          <div className="flex flex-col items-center gap-2 text-sm text-white/70 sm:flex-row sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="status-light" />
              CPU-optimised · No GPU required
            </div>
            <div className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              <span>Secure Stripe checkout · Cancel anytime</span>
            </div>
          </div>
        </motion.section>

        {/* Social proof / outcomes */}
        <motion.section
          className="grid gap-4 py-10 text-base text-white/85 sm:grid-cols-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
              <Users className="h-3.5 w-3.5 text-amber-300" />
              Producers we&apos;ve helped
            </p>
            <p>Indie artists, mix engineers, and small studios using CPU-only machines to get stems fast.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
              <Clock className="h-3.5 w-3.5 text-amber-300" />
              Time saved
            </p>
            <p>Drop a track, get usable stems in minutes — no waiting on freelance engineers or bouncing DAW sessions.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              Zero-risk trial
            </p>
            <p>Try it with a few songs, then upgrade only if it actually speeds up your workflow.</p>
          </div>
        </motion.section>

        {/* Personas / use cases */}
        <motion.section
          className="grid gap-4 py-6 text-base text-white/85 sm:grid-cols-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18 }}
        >
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
              <Headphones className="h-3.5 w-3.5 text-amber-300" />
              Vocalists & artists
            </p>
            <p className="text-sm text-white/80">
              Strip out your vocals or instrumentals for remixes, live sets, and content without hunting for acapellas.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
              <AudioWaveform className="h-3.5 w-3.5 text-amber-300" />
              Mix & mastering engineers
            </p>
            <p className="text-sm text-white/80">
              Grab stems from reference tracks to study balances, recreate tones, or build quick mockups for clients.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
              <Guitar className="h-3.5 w-3.5 text-amber-300" />
              Creators & educators
            </p>
            <p className="text-sm text-white/80">
              Solo out parts for lessons, breakdowns, and YouTube content without wrestling with DAW sessions.
            </p>
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
                <p className="text-sm leading-6 text-white/75">{f.desc}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Personas → recommended plans */}
        <motion.section
          className="py-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.22 }}
        >
          <p className="eyebrow mb-4 text-center">Who Burnt Beats is for</p>
          <div className="grid grid-cols-1 gap-4 text-sm text-white/80 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                Occasional creators
              </p>
              <p className="mb-2">
                Need stems a few times a month for edits, remixes, or content drops.
              </p>
              <p className="mb-2 text-[11px] font-semibold text-amber-200">
                Recommended: Top‑Up Pack
              </p>
              <button
                type="button"
                className="ghost-button tap-feedback px-3 py-1.5 text-[11px]"
                onClick={() => {
                  const el = document.getElementById("pricing");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                View plans
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                Working artists &amp; producers
              </p>
              <p className="mb-2">
                Bounce between projects every week and want a steady flow of stems.
              </p>
              <p className="mb-2 text-[11px] font-semibold text-amber-200">
                Recommended: Basic or Premium
              </p>
              <button
                type="button"
                className="ghost-button tap-feedback px-3 py-1.5 text-[11px]"
                onClick={() => {
                  const el = document.getElementById("pricing");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                View plans
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                Studios &amp; mix engineers
              </p>
              <p className="mb-2">
                Live in stems all day, juggling clients, reference mixes, and exports.
              </p>
              <p className="mb-2 text-[11px] font-semibold text-amber-200">
                Recommended: Studio
              </p>
              <button
                type="button"
                className="ghost-button tap-feedback px-3 py-1.5 text-[11px]"
                onClick={() => {
                  const el = document.getElementById("pricing");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                View plans
              </button>
            </div>
          </div>
        </motion.section>

        {/* Pricing — Stripe hosted pricing table */}
        <motion.section
          id="pricing"
          className="py-16"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          <p className="eyebrow mb-2 text-center">Pricing</p>
          <p className="mb-8 text-center text-base text-white/75">
            Simple plans. Cancel anytime. No hidden fees or surprise overages.
          </p>
          <p className="mb-6 text-center text-sm font-medium text-white/80">
            No contracts · Cancel online whenever you like · Start with a one‑time Top‑Up if you&apos;re unsure.
          </p>

          <div className="glass-panel rounded-2xl border border-white/10 p-4 sm:p-6">
            <StripePricingTableEmbed />
          </div>

          {/* FAQ near pricing to remove objections */}
          <div className="mt-10 grid gap-4 text-left text-sm text-white/80 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                Will this work on my laptop?
              </p>
              <p>
                Yes. Burnt Beats is tuned for CPU-friendly processing — no GPU or special hardware required. If you can
                stream music, you can split stems.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                How do tokens map to songs?
              </p>
              <p>
                1 token = 1 minute of audio. A 3‑minute track costs 3 tokens to split, and another 3 if you expand to 4 stems. Partial minutes round up, so you always know the cost upfront.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                Can I cancel or change plans?
              </p>
              <p>
                Absolutely. Manage everything through Stripe — upgrade, downgrade, or cancel with a couple of clicks.
                No emails or phone calls required.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                Do I have to subscribe?
              </p>
              <p>
                No. If you only need stems occasionally, you can use the Top‑Up pack to buy a one‑time block of tokens
                instead of a monthly plan.
              </p>
            </div>
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
          <p className="mb-8 text-base text-white/80">Create an account and start separating stems in seconds.</p>
          <SignUpButton mode="modal">
            <button type="button" className="fire-button tap-feedback text-base px-8 py-4">
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
