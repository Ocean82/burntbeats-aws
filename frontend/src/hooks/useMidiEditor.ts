/**
 * useMidiEditor — state management for the interactive MIDI note editor.
 * Handles note selection, CRUD operations, undo/redo, tool state, and grid snapping.
 * Entirely client-side — no server calls for editing operations.
 */
import { useCallback, useMemo, useRef, useState } from "react";
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

function snapToGrid(time: number, bpm: number, grid: SnapGrid): number {
  if (grid === "free") return time;
  const gridDivision = parseInt(grid.split("/")[1]);
  const gridSizeSeconds = (4 / gridDivision) * (60 / bpm);
  return Math.round(time / gridSizeSeconds) * gridSizeSeconds;
}

function snapDuration(duration: number, bpm: number, grid: SnapGrid): number {
  if (grid === "free") return Math.max(duration, 0.01);
  const gridDivision = parseInt(grid.split("/")[1]);
  const gridSizeSeconds = (4 / gridDivision) * (60 / bpm);
  const snapped = Math.max(Math.round(duration / gridSizeSeconds) * gridSizeSeconds, gridSizeSeconds);
  return snapped;
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
  }));

  const historyRef = useRef<HistoryEntry[]>([
    { notes: notesFromConversion(initialNotes), selectedIds: new Set() },
  ]);
  const historyIndexRef = useRef(0);

  const pushHistory = useCallback((notes: EditableNote[], selectedIds: Set<string>) => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push({ notes: notes.map((n) => ({ ...n })), selectedIds: new Set(selectedIds) });
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
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
      pushHistory(notes, new Set());
      return { ...s, notes, selectedIds: new Set(), isModified: true };
    });
  }, [pushHistory]);

  const deleteNote = useCallback((noteId: string) => {
    setState((s) => {
      const notes = s.notes.filter((n) => n.id !== noteId);
      const selectedIds = new Set(s.selectedIds);
      selectedIds.delete(noteId);
      pushHistory(notes, selectedIds);
      return { ...s, notes, selectedIds, isModified: true };
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
      pushHistory(notes, selectedIds);
      return { ...s, notes, selectedIds, isModified: true };
    });
  }, [pushHistory]);

  const moveNotes = useCallback((noteIds: string[], deltaPitch: number, deltaTime: number) => {
    setState((s) => {
      const idSet = new Set(noteIds);
      const notes = s.notes.map((n) => {
        if (!idSet.has(n.id)) return n;
        const newPitch = Math.max(0, Math.min(127, n.pitch + deltaPitch));
        const rawStart = n.start + deltaTime;
        const newStart = s.snapGrid === "free"
          ? Math.max(0, rawStart)
          : Math.max(0, snapToGrid(rawStart, s.bpm, s.snapGrid));
        return { ...n, pitch: newPitch, start: newStart };
      });
      pushHistory(notes, s.selectedIds);
      return { ...s, notes, isModified: true };
    });
  }, [pushHistory]);

  const resizeNote = useCallback((noteId: string, newDuration: number) => {
    setState((s) => {
      const notes = s.notes.map((n) => {
        if (n.id !== noteId) return n;
        const snapped = snapDuration(newDuration, s.bpm, s.snapGrid);
        return { ...n, duration: Math.max(0.01, snapped) };
      });
      pushHistory(notes, s.selectedIds);
      return { ...s, notes, isModified: true };
    });
  }, [pushHistory]);

  const setSelectedVelocity = useCallback((velocity: number) => {
    setState((s) => {
      if (s.selectedIds.size === 0) return s;
      const vel = Math.max(1, Math.min(127, velocity));
      const notes = s.notes.map((n) =>
        s.selectedIds.has(n.id) ? { ...n, velocity: vel } : n,
      );
      pushHistory(notes, s.selectedIds);
      return { ...s, notes, isModified: true };
    });
  }, [pushHistory]);

  const transposeSelected = useCallback((semitones: number) => {
    setState((s) => {
      if (s.selectedIds.size === 0) return s;
      const notes = s.notes.map((n) => {
        if (!s.selectedIds.has(n.id)) return n;
        return { ...n, pitch: Math.max(0, Math.min(127, n.pitch + semitones)) };
      });
      pushHistory(notes, s.selectedIds);
      return { ...s, notes, isModified: true };
    });
  }, [pushHistory]);

  // --- Undo / Redo ---
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    setState((s) => ({
      ...s,
      notes: entry.notes.map((n) => ({ ...n })),
      selectedIds: new Set(entry.selectedIds),
      isModified: historyIndexRef.current > 0,
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
    }));
  }, []);

  // --- Derived ---
  const selectedNotes = useMemo(
    () => state.notes.filter((n) => state.selectedIds.has(n.id)),
    [state.notes, state.selectedIds],
  );

  const gridSizeSeconds = useMemo(() => {
    if (state.snapGrid === "free") return 0;
    const div = parseInt(state.snapGrid.split("/")[1]);
    return (4 / div) * (60 / state.bpm);
  }, [state.snapGrid, state.bpm]);

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
