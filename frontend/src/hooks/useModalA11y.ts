import { type RefObject, useEffect } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function useModalA11y(
  isOpen: boolean,
  modalRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options?: { disableEscape?: boolean }
): void {
  useEffect(() => {
    if (!isOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const root = modalRef.current;
    if (!root) return;

    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const firstFocusable = focusables[0] ?? root;
    firstFocusable.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !options?.disableEscape) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const current = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (current.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }

      const first = current[0];
      const last = current[current.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActive?.focus?.();
    };
  }, [isOpen, modalRef, onClose, options?.disableEscape]);
}
