import { motion, useReducedMotion } from "framer-motion";
import { AudioLines, Users, Zap } from "lucide-react";
import { brandScrollSection } from "../../motion/brandPresets";

const PROOF_POINTS = [
  {
    icon: AudioLines,
    value: "12,400+",
    label: "stems separated",
  },
  {
    icon: Users,
    value: "2,100+",
    label: "producers active",
  },
  {
    icon: Zap,
    value: "5 free min",
    label: "every month, no card",
  },
] as const;

const TESTIMONIALS = [
  {
    quote:
      "Replaced three tools in my remix workflow. Split, adjust levels, export — all without leaving the browser.",
    author: "Jake M.",
    role: "DJ / Producer",
  },
  {
    quote:
      "The MIDI handoff alone is worth it. I go from a vocal chop to a melody line in the same session.",
    author: "Priya S.",
    role: "Beat maker",
  },
  {
    quote:
      "I was skeptical about browser-based, but the quality matches my desktop splitter. And I keep my stems organized.",
    author: "Carlos R.",
    role: "Audio engineer",
  },
] as const;

export function LandingSocialProof() {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.section
      aria-label="Social proof and user testimonials"
      className="w-full py-[clamp(2rem,4vw,3rem)]"
      {...brandScrollSection(reduceMotion)}
    >
      {/* Metrics strip */}
      <div className="flex flex-wrap items-center justify-center gap-lg rounded-2xl border border-border/60 bg-secondary/40 px-lg py-md sm:gap-xl">
        {PROOF_POINTS.map((point) => (
          <div
            key={point.label}
            className="flex items-center gap-sm text-center sm:text-left"
          >
            <point.icon
              className="h-5 w-5 shrink-0 text-primary-400/80"
              aria-hidden="true"
            />
            <div className="flex items-baseline gap-xs">
              <span className="text-lg font-bold text-foreground sm:text-xl">
                {point.value}
              </span>
              <span className="text-xs text-muted-foreground sm:text-sm">
                {point.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Testimonials */}
      <div className="mt-lg grid gap-md sm:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <blockquote
            key={t.author}
            className="rounded-xl border border-border/50 bg-background/40 px-md py-sm"
          >
            <p className="text-sm leading-relaxed text-secondary-foreground">
              "{t.quote}"
            </p>
            <footer className="mt-sm flex items-center gap-xs">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/20 text-[9px] font-bold text-primary-300"
                aria-hidden="true"
              >
                {t.author.charAt(0)}
              </div>
              <div>
                <cite className="not-italic text-xs font-semibold text-foreground">
                  {t.author}
                </cite>
                <p className="text-[11px] text-muted-foreground">{t.role}</p>
              </div>
            </footer>
          </blockquote>
        ))}
      </div>
    </motion.section>
  );
}
