import { motion, useReducedMotion } from "framer-motion";
import { Layers, RotateCcw, Piano, Workflow } from "lucide-react";
import { brandScrollSection } from "../../motion/brandPresets";

const DIFFERENTIATORS = [
  {
    icon: Layers,
    title: "In-browser mixer and editor",
    body:
      "After the split, you can level, trim, and shape the result without immediately bouncing into another tool.",
  },
  {
    icon: RotateCcw,
    title: "Reopen past stem jobs",
    body:
      "Your splits are not disposable downloads. Return to old jobs from Your Splits and keep working from the same history.",
  },
  {
    icon: Piano,
    title: "Stem-to-MIDI workflow built in",
    body:
      "Move from separated audio into MIDI conversion inside the same product instead of breaking your workflow across multiple apps.",
    highlight: true,
  },
  {
    icon: Workflow,
    title: "Built for producers and DJs",
    body:
      "Burnt Beats is designed like a lightweight browser workstation, not a one-click converter. The value is in the workflow, not just the split.",
  },
] as const;

export function LandingDifferentiatorsSection() {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.section
      aria-labelledby="landing-differentiators-title"
      className="w-full"
      {...brandScrollSection(reduceMotion)}
    >
      <div className="grid w-full gap-md py-[clamp(2rem,5vw,4rem)] text-left sm:grid-cols-2 md:gap-lg">
        <div className="w-full min-w-0 sm:col-span-2">
          <h2
            id="landing-differentiators-title"
            className="font-display text-[clamp(1.25rem,3vw,1.9rem)] font-bold leading-tight text-secondary-foreground"
            style={{ maxInlineSize: "48rem" }}
          >
            Most stem splitters stop at the download. Burnt Beats keeps the
            workflow moving.
          </h2>
        </div>

        {DIFFERENTIATORS.map((item) => (
          <div
            key={item.title}
            className={`min-w-0 rounded-2xl border p-lg ${
              "highlight" in item && item.highlight
                ? "border-primary-400/30 bg-primary-500/8"
                : "border-border bg-secondary/60"
            }`}
          >
            <div className="mb-sm flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/60">
              <item.icon className="h-4 w-4 text-primary-300/90" aria-hidden="true" />
            </div>
            <h3 className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
              {item.title}
            </h3>
            <p className="w-full text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
