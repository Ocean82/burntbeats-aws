import { SignUpButton } from "@clerk/react";
import { motion, useReducedMotion } from "framer-motion";
import { brandScrollSection } from "../../motion/brandPresets";

export function LandingFinalCta() {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.section
      aria-labelledby="landing-cta-title"
      className="w-full"
      {...brandScrollSection(reduceMotion, 0.08)}
    >
      <div className="glass-panel mirror-sheen relative mb-16 w-full overflow-hidden rounded-4xl px-md py-[clamp(3rem,6vw,5rem)] text-center sm:px-xl">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 80%, rgba(255, 60, 10, 0.18), transparent 60%)",
          }}
        />
        <h2
          id="landing-cta-title"
          className="landing-prose-lg text-readable relative mb-xs text-center font-display text-[clamp(1.5rem,4vw,2.5rem)] font-bold leading-tight text-secondary-foreground"
        >
          Ready to build your first stem workflow?
        </h2>
        <p className="landing-prose text-readable text-readable-tight relative mb-10 text-center text-base text-secondary-foreground/80">
          Create an account, split your first track, and keep working inside the
          same browser session.
        </p>
        <SignUpButton mode="modal">
          <button
            type="button"
            className="fire-button tap-feedback relative text-[clamp(1rem,2vw,1.2rem)] px-[clamp(2rem,4vw,3rem)] py-[clamp(0.9rem,2vw,1.2rem)] font-bold"
          >
            Create free account
          </button>
        </SignUpButton>
      </div>
    </motion.section>
  );
}
