/**
 * Product motion presets — state feedback, not decoration.
 * 150–250ms transitions; ease-out-quart; no bounce/elastic.
 */
import type { Transition } from "framer-motion";

/** cubic-bezier(0.25, 1, 0.5, 1) — natural deceleration */
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

export const motionMs = {
  /** Button press, toggle */
  instant: 120,
  /** Hover, menu open, toast */
  fast: 180,
  /** View crossfade, panel reveal */
  normal: 220,
  /** Accordion, layout (use sparingly in product) */
  layout: 320,
  /** Exit ~75% of enter */
  exit: 165,
} as const;

export function msToSec(ms: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : ms / 1000;
}

export function productTransition(
  reduceMotion: boolean,
  kind: keyof typeof motionMs = "fast",
): Transition {
  return {
    duration: msToSec(motionMs[kind], reduceMotion),
    ease: EASE_OUT_QUART,
  };
}

/** Tab / tool view switch — opacity only, no page-load choreography */
export function viewSwitchMotion(reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: productTransition(false, "fast"),
  };
}

export function modalBackdropMotion(reduceMotion: boolean) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: productTransition(reduceMotion, "fast"),
  };
}

export function modalContentMotion(reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, scale: 0.98, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: {
      opacity: 0,
      scale: 0.98,
      y: 6,
      transition: productTransition(false, "exit"),
    },
    transition: productTransition(false, "fast"),
  };
}

/** Stagger for in-panel reveals (editor rail only — keep subtle) */
export function staggerContainer(reduceMotion: boolean, delayMs = 50) {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : delayMs / 1000,
      },
    },
  };
}

export function staggerItem(reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      hidden: { opacity: 1 },
      visible: { opacity: 1 },
    };
  }
  return {
    hidden: { opacity: 0, y: 6 },
    visible: {
      opacity: 1,
      y: 0,
      transition: productTransition(false, "fast"),
    },
  };
}

/** Expand/collapse panels — layout change, use sparingly */
export function collapseMotion(reduceMotion: boolean) {
  const style = { overflow: "hidden" as const };
  if (reduceMotion) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0 },
      style,
    };
  }
  return {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: "auto" },
    exit: { opacity: 0, height: 0 },
    transition: productTransition(false, "layout"),
    style,
  };
}

/** Inline alerts (errors, validation) */
export function alertRevealMotion(reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: productTransition(false, "fast"),
  };
}

/** Top/bottom banners (offline, export notice) */
export function bannerSlideMotion(
  reduceMotion: boolean,
  edge: "top" | "bottom" = "top",
) {
  const offset = edge === "top" ? -12 : 12;
  if (reduceMotion) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: offset },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: offset },
    transition: productTransition(false, "fast"),
  };
}

/** Floating panels (batch queue) — state reveal, not page choreography */
export function panelEnterMotion(reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 16 },
    transition: productTransition(false, "fast"),
  };
}
