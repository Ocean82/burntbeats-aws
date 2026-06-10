import { createContext, useContext } from "react";
import type { PhaseController } from "@/types/phases";

/**
 * React Context for the PhaseController state machine.
 * Provides phase state and transition methods to all children
 * within the transitional split flow.
 */
const PhaseContext = createContext<PhaseController | null>(null);

export interface PhaseProviderProps {
  controller: PhaseController;
  children: React.ReactNode;
}

/**
 * Wraps children with PhaseController context.
 * Used by EditorAppShell to provide phase state to HeaderBar, PhaseRouter, etc.
 */
export function PhaseProvider({ controller, children }: PhaseProviderProps) {
  return (
    <PhaseContext.Provider value={controller}>{children}</PhaseContext.Provider>
  );
}

/**
 * Access the PhaseController from context.
 * Must be used within a PhaseProvider.
 */
export function usePhaseContext(): PhaseController {
  const context = useContext(PhaseContext);
  if (!context) {
    throw new Error("usePhaseContext must be used within a PhaseProvider");
  }
  return context;
}
