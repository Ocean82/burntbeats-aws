import { useCallback, useEffect, useRef } from "react";

function getToolCards(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-tour^="tool-"]'),
  );
}

function isModalOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') != null;
}

export function useHubKeyboardNav(enabled: boolean) {
  const focusedIndexRef = useRef(-1);

  const moveFocus = useCallback((delta: number) => {
    const cards = getToolCards();
    if (cards.length === 0) return;

    let next = focusedIndexRef.current;
    if (next < 0) {
      next = delta > 0 ? 0 : cards.length - 1;
    } else {
      next = (next + delta + cards.length) % cards.length;
    }

    focusedIndexRef.current = next;
    cards[next]?.focus();
  }, []);

  const activateFocused = useCallback(() => {
    const cards = getToolCards();
    const index = focusedIndexRef.current;
    if (index >= 0 && index < cards.length) {
      cards[index]?.click();
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled || isModalOpen()) return;

      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(1);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(-1);
        return;
      }

      if (event.key === "Enter" && focusedIndexRef.current >= 0) {
        const cards = getToolCards();
        if (document.activeElement === cards[focusedIndexRef.current]) {
          return;
        }
        event.preventDefault();
        activateFocused();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, moveFocus, activateFocused]);

  useEffect(() => {
    if (!enabled) focusedIndexRef.current = -1;
  }, [enabled]);
}
