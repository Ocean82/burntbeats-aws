import { create } from "zustand";
import type { StemEditorState } from "../stem-editor-state";

interface HistoryState {
  past: Record<string, StemEditorState>[];
  present: Record<string, StemEditorState>;
  future: Record<string, StemEditorState>[];
}

interface WorkflowStore {
  stemStates: Record<string, StemEditorState>;
  canUndo: boolean;
  canRedo: boolean;
  
  setStemStates: (newState: Record<string, StemEditorState> | ((prev: Record<string, StemEditorState>) => Record<string, StemEditorState>)) => void;
  undo: () => void;
  redo: () => void;
  reset: (initialState: Record<string, StemEditorState>) => void;
}

const MAX_HISTORY = 50;

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  stemStates: {},
  canUndo: false,
  canRedo: false,

  setStemStates: (newState) => set((state) => {
    const present = state.stemStates;
    const nextPresent = typeof newState === "function" ? newState(present) : newState;
    
    if (present === nextPresent) return state;

    // We need to manage history here. 
    // Since this is a bit complex for a simple set call, maybe we should have a separate action.
    // For now, let's just update the present. 
    // Actually, let's keep the history logic in a hook if it's too much for Zustand.
    
    return { stemStates: nextPresent };
  }),

  undo: () => {}, // To be implemented or kept in context
  redo: () => {},
  reset: (initialState) => set({ stemStates: initialState, canUndo: false, canRedo: false }),
}));
