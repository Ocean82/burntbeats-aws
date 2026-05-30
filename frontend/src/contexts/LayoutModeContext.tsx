/**
 * LayoutModeContext — DJ mixer layout is the shipped editor surface.
 * Classic MultiStemEditor remains in the codebase but is not user-selectable until
 * product re-enables a layout toggle (localStorage is normalized to "dj" on load).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type LayoutMode = "dj" | "classic";

interface LayoutModeContextValue {
  mode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = "burntbeats_layout_mode";

function getInitialMode(): LayoutMode {
  if (typeof window === "undefined") return "dj";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "classic") {
    localStorage.setItem(STORAGE_KEY, "dj");
  }
  return "dj";
}

const LayoutModeContext = createContext<LayoutModeContextValue>({
  mode: "dj",
  setMode: () => {},
  toggleMode: () => {},
});

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LayoutMode>(getInitialMode);

  const setMode = useCallback((next: LayoutMode) => {
    setModeState("dj");
    localStorage.setItem(STORAGE_KEY, "dj");
    void next;
  }, []);

  const toggleMode = useCallback(() => {
    setModeState("dj");
    localStorage.setItem(STORAGE_KEY, "dj");
  }, []);

  const value = useMemo<LayoutModeContextValue>(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode],
  );

  return (
    <LayoutModeContext.Provider value={value}>
      {children}
    </LayoutModeContext.Provider>
  );
}

export function useLayoutMode() {
  return useContext(LayoutModeContext);
}
