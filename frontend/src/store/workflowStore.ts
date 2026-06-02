import { create } from "zustand";
import type { StemEditorState } from "../stem-editor-state";

const HISTORY_LIMIT = 50;

interface WorkflowHistoryState {
  past: Record<string, StemEditorState>[];
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

function sliceRecentHistory(
  past: Record<string, StemEditorState>[],
): Record<string, StemEditorState>[] {
  if (past.length <= HISTORY_LIMIT) return past;
  return past.slice(past.length - HISTORY_LIMIT);
}

export const useWorkflowStore = create<WorkflowStore & WorkflowHistoryState>((set) => ({
  stemStates: {},
  canUndo: false,
  canRedo: false,
  past: [],
  future: [],

  setStemStates: (newState) => set((state) => {
    const present = state.stemStates;
    const nextPresent = typeof newState === "function" ? newState(present) : newState;
    
    if (present === nextPresent) return state;
    const nextPast = sliceRecentHistory([...state.past, present]);
    return {
      stemStates: nextPresent,
      past: nextPast,
      future: [],
      canUndo: nextPast.length > 0,
      canRedo: false,
    };
  }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const nextPast = state.past.slice(0, -1);
      const nextFuture = [state.stemStates, ...state.future];
      return {
        stemStates: previous,
        past: nextPast,
        future: nextFuture,
        canUndo: nextPast.length > 0,
        canRedo: true,
      };
    }),
  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const [nextPresent, ...restFuture] = state.future;
      const nextPast = sliceRecentHistory([...state.past, state.stemStates]);
      return {
        stemStates: nextPresent,
        past: nextPast,
        future: restFuture,
        canUndo: true,
        canRedo: restFuture.length > 0,
      };
    }),
  reset: (initialState) =>
    set({
      stemStates: initialState,
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    }),
}));
