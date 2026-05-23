/**
 * Brand / marketing motion — orchestrated entrances, staggered reveals, scroll-driven sections.
 * Use on LandingPage and other pre-auth marketing surfaces only.
 */
import type { Transition, Variants } from "framer-motion";
import { EASE_OUT_QUART } from "./presets";

export const brandMotionMs = {
  /** Hero & primary section entrance */
  entrance: 600,
  /** Below-fold sections (scroll-triggered) */
  section: 500,
  /** Stagger between hero children */
  stagger: 120,
} as const;

function brandTransition(reduceMotion: boolean, durationMs: number): Transition {
  return reduceMotion
    ? { duration: 0 }
    : { duration: durationMs / 1000, ease: EASE_OUT_QUART };
}

/** Hero container — one orchestrated page-load sequence */
export function brandHeroContainer(reduceMotion: boolean) {
  return {
    initial: "hidden" as const,
    animate: "visible" as const,
    variants: {
      hidden: {},
      visible: {
        transition: {
          staggerChildren: reduceMotion ? 0 : brandMotionMs.stagger / 1000,
        },
      },
    } satisfies Variants,
  };
}

/** Child of brand hero stagger */
export function brandHeroItemVariants(reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 1, y: 0 },
      visible: { opacity: 1, y: 0 },
    };
  }
  return {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: brandTransition(false, brandMotionMs.entrance),
    },
  };
}

/** Scroll-triggered section reveal (pricing, footer CTA) */
export function brandScrollSection(reduceMotion: boolean, delaySec = 0) {
  if (reduceMotion) {
    return {
      initial: false as const,
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true, amount: 0.2 },
    };
  }
  return {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2, margin: "-60px" },
    transition: {
      ...brandTransition(false, brandMotionMs.section),
      delay: delaySec,
    },
  };
}
