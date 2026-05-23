import { useReducedMotion } from "framer-motion";
import {
  alertRevealMotion,
  bannerSlideMotion,
  collapseMotion,
  modalBackdropMotion,
  modalContentMotion,
  panelEnterMotion,
  productTransition,
  staggerContainer,
  staggerItem,
  viewSwitchMotion,
} from "./presets";

/**
 * Central motion config for the product app (not marketing pages).
 * Respects prefers-reduced-motion via Framer's hook + global CSS.
 */
export function useProductMotion() {
  const reduceMotion = useReducedMotion() ?? false;

  return {
    reduceMotion,
    viewSwitch: viewSwitchMotion(reduceMotion),
    modalBackdrop: modalBackdropMotion(reduceMotion),
    modalContent: modalContentMotion(reduceMotion),
    transition: (kind: "instant" | "fast" | "normal" | "layout" | "exit" = "fast") =>
      productTransition(reduceMotion, kind),
    staggerContainer: (delayMs?: number) => staggerContainer(reduceMotion, delayMs),
    staggerItem: () => staggerItem(reduceMotion),
    collapse: () => collapseMotion(reduceMotion),
    alertReveal: () => alertRevealMotion(reduceMotion),
    bannerSlide: (edge?: "top" | "bottom") => bannerSlideMotion(reduceMotion, edge),
    panelEnter: () => panelEnterMotion(reduceMotion),
  };
}
