/**
 * useMidiEditor — state management for the interactive MIDI note editor.
 * Handles note selection, CRUD operations, undo/redo, tool state, and grid snapping.
 * Entirely client-side — no server calls for editing operations.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  getGridSizeSeconds,
  snapDeltaTime,
  snapDuration,
  snapToGrid,
} from "../utils/midiEditorSnap";
import type { MidiNoteEvent } from "./useMidiConvert";

export type EditorTool = "select" | "draw" | "erase";
export type SnapGrid = "1/4" | "1/8" | "1/16" | "1/32" | "free";

export interface EditableNote extends MidiNoteEvent {
  id: string;
}

export interface MidiEditorState {
  notes: EditableNote[];
  selectedIds: Set<string>;
  tool: EditorTool;
  snapGrid: SnapGrid;
  bpm: number;
  drawVelocity: number;
  isModified: boolean;
  /** Current position in the undo history stack. */
  historyIndex: number;
  /** Total entries in the undo history stack. */
  historyLength: number;
}

interface HistoryEntry {
  notes: EditableNote[];
  selectedIds: Set<string>;
}

const MAX_HISTORY = 50;

let _nextId = 1;
function generateNoteId(): string {
  return `n_${_nextId++}_${Date.now().toString(36)}`;
}

export function notesFromConversion(notes: MidiNoteEvent[]): EditableNote[] {
  return notes.map((n) => ({ ...n, id: generateNoteId() }));
}

export function useMidiEditor(initialNotes: MidiNoteEvent[], initialBpm: number) {
  const [state, setState] = useState<MidiEditorState>(() => ({
    notes: notesFromConversion(initialNotes),
    selectedIds: new Set(),
    tool: "select",
    snapGrid: "1/16",
    bpm: initialBpm || 120,
    drawVelocity: 80,
    isModified: false,
    historyIndex: 0,
    historyLength: 1,
  }));

  const historyRef = useRef<HistoryEntry[]>([
    { notes: notesFromConversion(initialNotes), selectedIds: new Set() },
  ]);
  const historyIndexRef = useRef(0);

  const pushHistory = useCallback((notes: EditableNote[], selectedIds: Set<string>): { historyIndex: number; historyLength: number } => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push({ notes: notes.map((n) => ({ ...n })), selectedIds: new Set(selectedIds) });
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    return { historyIndex: historyIndexRef.current, historyLength: newHistory.length };
  }, []);

  // --- Tool selection ---
  const setTool = useCallback((tool: EditorTool) => {
    setState((s) => ({ ...s, tool, selectedIds: tool !== "select" ? new Set() : s.selectedIds }));
  }, []);

  const setSnapGrid = useCallback((snapGrid: SnapGrid) => {
    setState((s) => ({ ...s, snapGrid }));
  }, []);

  const setBpm = useCallback((bpm: number) => {
    setState((s) => ({ ...s, bpm: Math.max(40, Math.min(300, bpm)) }));
  }, []);

  const setDrawVelocity = useCallback((drawVelocity: number) => {
    setState((s) => ({ ...s, drawVelocity: Math.max(1, Math.min(127, drawVelocity)) }));
  }, []);

  // --- Selection ---
  const selectNote = useCallback((noteId: string, additive: boolean) => {
    setState((s) => {
      const next = new Set(additive ? s.selectedIds : []);
      if (next.has(noteId) && additive) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return { ...s, selectedIds: next };
    });
  }, []);

  const selectNotes = useCallback((noteIds: string[], additive: boolean) => {
    setState((s) => {
      const next = new Set(additive ? s.selectedIds : noteIds);
      if (additive) {
        for (const id of noteIds) next.add(id);
      }
      return { ...s, selectedIds: next };
    });
  }, []);

  const selectAll = useCallback(() => {
    setState((s) => ({
      ...s,
      selectedIds: new Set(s.notes.map((n) => n.id)),
    }));
  }, []);

  const deselectAll = useCallback(() => {
    setState((s) => ({ ...s, selectedIds: new Set() }));
  }, []);

  // --- Note operations ---
  const deleteSelected = useCallback(() => {
    setState((s) => {
      if (s.selectedIds.size === 0) return s;
      const notes = s.notes.filter((n) => !s.selectedIds.has(n.id));
      const h = pushHistory(notes, new Set());
      return { ...s, notes, selectedIds: new Set(), isModified: true, ...h };
    });
  }, [pushHistory]);

  const deleteNote = useCallback((noteId: string) => {
    setState((s) => {
      const notes = s.notes.filter((n) => n.id !== noteId);
      const selectedIds = new Set(s.selectedIds);
      selectedIds.delete(noteId);
      const h = pushHistory(notes, selectedIds);
      return { ...s, notes, selectedIds, isModified: true, ...h };
    });
  }, [pushHistory]);

  const addNote = useCallback((pitch: number, start: number, duration?: number) => {
    setState((s) => {
      const snappedStart = snapToGrid(start, s.bpm, s.snapGrid);
      const snappedDuration = duration
        ? snapDuration(duration, s.bpm, s.snapGrid)
        : snapDuration(0.25, s.bpm, s.snapGrid);
      const newNote: EditableNote = {
        id: generateNoteId(),
        pitch: Math.max(0, Math.min(127, pitch)),
        start: Math.max(0, snappedStart),
        duration: snappedDuration,
        velocity: s.drawVelocity,
      };
      const notes = [...s.notes, newNote];
      const selectedIds = new Set([newNote.id]);
      const h = pushHistory(notes, selectedIds);
      return { ...s, notes, selectedIds, isModified: true, ...h };
    });
  }, [pushHistory]);

  const moveNotes = useCallback((noteIds: string[], deltaPitch: number, deltaTime: number) => {
    setState((s) => {
      const idSet = new Set(noteIds);
      const notes = s.notes.map((n) => {
        if (!idSet.has(n.id)) return n;
        const newPitch = Math.max(0, Math.min(127, n.pitch + deltaPitch));
        const snappedDelta = snapDeltaTime(deltaTime, s.bpm, s.snapGrid);
        const newStart = Math.max(0, n.start + snappedDelta);
        return { ...n, pitch: newPitch, start: newStart };
      });
      const h = pushHistory(notes, s.selectedIds);
      return { ...s, notes, isModified: true, ...h };
    });
  }, [pushHistory]);

  const resizeNote = useCallback((noteId: string, newDuration: number) => {
    setState((s) => {
      const notes = s.notes.map((n) => {
        if (n.id !== noteId) return n;
        const snapped = snapDuration(newDuration, s.bpm, s.snapGrid);
        return { ...n, duration: Math.max(0.01, snapped) };
      });
      const h = pushHistory(notes, s.selectedIds);
      return { ...s, notes, isModified: true, ...h };
    });
  }, [pushHistory]);

  const setSelectedVelocity = useCallback((velocity: number) => {
    setState((s) => {
      if (s.selectedIds.size === 0) return s;
      const vel = Math.max(1, Math.min(127, velocity));
      const notes = s.notes.map((n) =>
        s.selectedIds.has(n.id) ? { ...n, velocity: vel } : n,
      );
      const h = pushHistory(notes, s.selectedIds);
      return { ...s, notes, isModified: true, ...h };
    });
  }, [pushHistory]);

  const transposeSelected = useCallback((semitones: number) => {
    setState((s) => {
      if (s.selectedIds.size === 0) return s;
      const notes = s.notes.map((n) => {
        if (!s.selectedIds.has(n.id)) return n;
        return { ...n, pitch: Math.max(0, Math.min(127, n.pitch + semitones)) };
      });
      const h = pushHistory(notes, s.selectedIds);
      return { ...s, notes, isModified: true, ...h };
    });
  }, [pushHistory]);

  // --- Undo / Redo ---
  // Derive canUndo/canRedo from state fields (not refs) to avoid reading refs during render.
  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.historyLength - 1;

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    setState((s) => ({
      ...s,
      notes: entry.notes.map((n) => ({ ...n })),
      selectedIds: new Set(entry.selectedIds),
      isModified: historyIndexRef.current > 0,
      historyIndex: historyIndexRef.current,
      historyLength: historyRef.current.length,
    }));
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const entry = historyRef.current[historyIndexRef.current];
    setState((s) => ({
      ...s,
      notes: entry.notes.map((n) => ({ ...n })),
      selectedIds: new Set(entry.selectedIds),
      isModified: true,
      historyIndex: historyIndexRef.current,
      historyLength: historyRef.current.length,
    }));
  }, []);

  // --- Reset ---
  const resetToOriginal = useCallback((originalNotes: MidiNoteEvent[]) => {
    const notes = notesFromConversion(originalNotes);
    historyRef.current = [{ notes: notes.map((n) => ({ ...n })), selectedIds: new Set() }];
    historyIndexRef.current = 0;
    setState((s) => ({
      ...s,
      notes,
      selectedIds: new Set(),
      isModified: false,
      historyIndex: 0,
      historyLength: 1,
    }));
  }, []);

  // --- Derived ---
  const selectedNotes = useMemo(
    () => state.notes.filter((n) => state.selectedIds.has(n.id)),
    [state.notes, state.selectedIds],
  );

  const gridSizeSeconds = useMemo(
    () => getGridSizeSeconds(state.bpm, state.snapGrid),
    [state.snapGrid, state.bpm],
  );

  return {
    ...state,
    selectedNotes,
    gridSizeSeconds,
    canUndo,
    canRedo,
    setTool,
    setSnapGrid,
    setBpm,
    setDrawVelocity,
    selectNote,
    selectNotes,
    selectAll,
    deselectAll,
    deleteSelected,
    deleteNote,
    addNote,
    moveNotes,
    resizeNote,
    setSelectedVelocity,
    transposeSelected,
    undo,
    redo,
    resetToOriginal,
  };
}
