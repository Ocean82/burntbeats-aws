import { motion, useReducedMotion } from "framer-motion";
import { Gift, Layers, ShieldCheck } from "lucide-react";
import { brandScrollSection } from "../../motion/brandPresets";

/** Honest value props — no fabricated user counts or testimonials. */
const VALUE_PROPS = [
  {
    icon: Gift,
    title: "Try before you subscribe",
    body: "10-minute welcome grant plus 5 free minutes every month. No card required to sign up.",
  },
  {
    icon: Layers,
    title: "More than a download",
    body: "Split, mix, reopen past jobs, and export in one browser tab — not five different apps.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent pricing",
    body: "1 token = 1 minute of audio. Packs from $0.99. Cancel subscriptions anytime.",
  },
] as const;

export function LandingSocialProof() {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.section
      aria-label="Why producers choose Burnt Beats"
      className="w-full py-[clamp(2rem,4vw,3rem)]"
      {...brandScrollSection(reduceMotion)}
    >
      <div className="grid gap-md sm:grid-cols-3">
        {VALUE_PROPS.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-border/50 bg-background/40 px-md py-sm"
          >
            <div className="mb-sm flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/60">
              <item.icon className="h-4 w-4 text-primary-300/90" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-lg text-center text-xs text-muted-foreground/80">
        Independent project — built and operated by a working producer, not a venture-backed clone farm.
      </p>
    </motion.section>
  );
}
