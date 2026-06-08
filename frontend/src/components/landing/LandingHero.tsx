import { SignInButton, SignUpButton } from "@clerk/react";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, Library, Piano } from "lucide-react";
import { WorkflowStepper } from "../ui";
import { LandingProductShowcase } from "./LandingProductShowcase";
import { EDITOR_WORKFLOW_STEPS } from "../../hooks/workflow/useEditorWorkflowSteps";
import {
  brandHeroContainer,
  brandHeroItemVariants,
} from "../../motion/brandPresets";

export function LandingHero() {
  const reduceMotion = useReducedMotion() ?? false;
  const heroItem = brandHeroItemVariants(reduceMotion);

  return (
    <motion.section
      aria-labelledby="landing-hero-title"
      className="landing-hero relative gap-xl py-[clamp(3rem,8vw,6rem)] text-center"
      {...brandHeroContainer(reduceMotion)}
    >
      <motion.div variants={heroItem} className="w-full">
        <p className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-xs rounded-full border border-border bg-muted px-md py-xs text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-100/90 sm:text-xs sm:tracking-[0.3em]">
          Browser workstation for producers and DJs
          <span className="h-1.5 w-1.5 rounded-full bg-(--accent) shadow-[0_0_14px_var(--accent)]" />
        </p>
      </motion.div>

      <motion.div variants={heroItem} className="w-full">
        <img
          src="/logo-emblem.png"
          alt=""
          className="logo-emblem mx-auto h-16 w-16 sm:h-20 sm:w-20"
          aria-hidden="true"
        />
      </motion.div>

      <motion.div variants={heroItem} className="w-full">
        <h1
          id="landing-hero-title"
          className="logo-burnt mx-auto w-full max-w-5xl text-[clamp(3.5rem,10vw,8rem)] font-bold leading-[0.92] tracking-[-0.05em]"
        >
          <span className="logo-burnt-fire">Burnt Beats</span>
        </h1>
      </motion.div>

      <motion.div variants={heroItem} className="w-full">
        <p className="landing-prose text-readable text-readable-tight text-center text-[clamp(1rem,2.5vw,1.25rem)] font-light leading-relaxed text-secondary-foreground">
          Burnt Beats is the browser workstation for producers and DJs who need
          more than isolated files. Split tracks into stems, shape the mix
          in-browser, reopen past jobs from your library, and move straight into
          MIDI or export.
        </p>
      </motion.div>

      <motion.div
        variants={heroItem}
        className="mt-lg flex flex-col items-center gap-md sm:flex-row"
      >
        <SignUpButton mode="modal">
          <button
            type="button"
            className="fire-button tap-feedback text-[clamp(1.1rem,2.5vw,1.35rem)] px-[clamp(2rem,5vw,3.5rem)] py-[clamp(1rem,2vw,1.4rem)] font-bold"
          >
            Try for Free
          </button>
        </SignUpButton>
        <SignInButton mode="modal">
          <button
            type="button"
            className="ghost-button tap-feedback text-sm px-lg py-md"
          >
            Sign In
          </button>
        </SignInButton>
      </motion.div>

      <motion.div
        variants={heroItem}
        className="mx-auto mt-lg w-full max-w-lg px-md"
      >
        <WorkflowStepper
          steps={[...EDITOR_WORKFLOW_STEPS]}
          activeStepId="upload"
          completedStepIds={[]}
        />
      </motion.div>

      <motion.div
        variants={heroItem}
        className="mt-md w-full"
      >
        <LandingProductShowcase />
      </motion.div>

      <motion.div
        variants={heroItem}
        className="mt-lg flex flex-col items-center gap-md sm:flex-row sm:gap-xl"
      >
        <div className="flex items-center gap-xs text-sm font-medium text-secondary-foreground">
          <ShieldCheck
            className="h-4 w-4 text-success-500/80"
            aria-hidden="true"
          />
          No install required
        </div>
        <div className="flex items-center gap-xs text-sm font-medium text-secondary-foreground">
          <Library className="h-4 w-4 text-primary-500/80" aria-hidden="true" />
          Reopen past stem jobs
        </div>
        <div className="flex items-center gap-xs text-sm font-medium text-secondary-foreground">
          <Piano className="h-4 w-4 text-midi-gold/80" aria-hidden="true" />
          Stem-to-MIDI workflow built in
        </div>
      </motion.div>

      <motion.div variants={heroItem} className="w-full">
        <p className="text-center text-xs text-muted-foreground/70">
          Secure Stripe billing · cancel anytime · one-time packs available
        </p>
      </motion.div>
    </motion.section>
  );
}
