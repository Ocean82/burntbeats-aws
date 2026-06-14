import { motion, useReducedMotion } from "framer-motion";
import { brandScrollSection } from "../../motion/brandPresets";

const DIFFERENTIATORS = [
  {
    title: "In-browser mixer and editor",
    body:
      "After the split, you can level, trim, and shape the result without immediately bouncing into another tool.",
  },
  {
    title: "Reopen past stem jobs",
    body:
      "Your splits are not disposable downloads. Return to old jobs from My Stems and keep working from the same history.",
  },
  {
    title: "Stem-to-MIDI workflow built in",
    body:
      "Move from separated audio into MIDI conversion inside the same product instead of breaking your workflow across multiple apps.",
  },
  {
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
          <p className="eyebrow mb-sm">Why Burnt Beats is different</p>
          <h2
            id="landing-differentiators-title"
            className="landing-prose-lg text-readable font-display text-[clamp(1.25rem,3vw,1.9rem)] font-bold leading-tight text-secondary-foreground"
          >
            Most stem splitters stop at the download. Burnt Beats keeps the
            workflow moving.
          </h2>
        </div>

        {DIFFERENTIATORS.map((item) => (
          <div
            key={item.title}
            className="min-w-0 rounded-2xl border border-border bg-secondary/60 p-lg"
          >
            <h3 className="mb-2 font-display text-sm font-bold tracking-[-0.01em] text-secondary-foreground">
              {item.title}
            </h3>
            <p className="text-readable w-full text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
