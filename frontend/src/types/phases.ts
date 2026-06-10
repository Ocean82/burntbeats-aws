/** Ordered phases of the stem editor flow. */
export type AppPhase = 'upload' | 'configure' | 'splitting' | 'workspace';

/** State machine controller for phase transitions. */
export interface PhaseController {
  phase: AppPhase;
  transitionTo: (next: AppPhase) => void;
  reset: () => void;
  error: string | null;
  setError: (msg: string | null) => void;
}

/** Visual state for a single step in the progress indicator. */
export interface StepDef {
  id: AppPhase;
  label: string;
  state: 'completed' | 'active' | 'upcoming';
}
