import { useReducedMotion } from "framer-motion";
import {
  modalBackdropMotion,
  modalContentMotion,
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
  };
}
