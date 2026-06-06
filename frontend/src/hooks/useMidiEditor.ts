import { useCallback, useMemo, useRef, useState } from "react";
import {
  getGridSizeSeconds,
  snapDeltaTime,
  snapDuration,
  snapToGrid,
} from "../utils/midiEditorSnap";
import type { MidiNoteEvent } from "./useMidiConvert";
import type {
  EditorTool,
  SnapGrid,
  TimeSignature,
  LoopRegion,
  CcLane,
  CcPoint,
  EditorTrack,
  EditableNote,
  ActiveLane,
  EditorViewState,
} from "../components/midi-convert/editorTypes";
import {
  DEFAULT_TIME_SIG,
  DEFAULT_LOOP,
  BUILTIN_CC_LANES,
  TRACK_COLORS,
  generateTrackId,
  generateNoteId,
} from "../components/midi-convert/editorTypes";

export type { EditorTool, SnapGrid, EditableNote, EditorTrack, CcLane, CcPoint, LoopRegion, TimeSignature, ActiveLane, EditorViewState };

const MAX_HISTORY = 50;

interface HistoryEntry {
  tracks: EditorTrack[];
  activeTrackId: string;
}

export function notesFromConversion(notes: MidiNoteEvent[]): EditableNote[] {
  return notes.map((n) => ({ ...n, id: generateNoteId() }));
}

function createInitialTrack(
  notes: EditableNote[],
  index: number,
  color?: string,
): EditorTrack {
  return {
    id: generateTrackId(),
    name: `Track ${index + 1}`,
    notes,
    selectedIds: new Set(),
    color: color ?? TRACK_COLORS[index % TRACK_COLORS.length],
    muted: false,
    soloed: false,
    ccLanes: BUILTIN_CC_LANES.map((l) => ({
      ...l,
      events: [],
      visible: false,
    })),
  };
}

export interface UseMidiEditorReturn {
  tracks: EditorTrack[];
  activeTrackId: string;
  activeTrack: EditorTrack;
  notes: EditableNote[];
  selectedIds: Set<string>;
  selectedNotes: EditableNote[];
  tool: EditorTool;
  snapGrid: SnapGrid;
  bpm: number;
  timeSignature: TimeSignature;
  loopRegion: LoopRegion;
  activeLane: ActiveLane;
  activeCcNumber: number;
  drawVelocity: number;
  isModified: boolean;
  canUndo: boolean;
  canRedo: boolean;
  gridSizeSeconds: number;
  setTool: (tool: EditorTool) => void;
  setSnapGrid: (grid: SnapGrid) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (ts: TimeSignature) => void;
  setLoopRegion: (region: LoopRegion) => void;
  setActiveLane: (lane: ActiveLane) => void;
  setActiveCcNumber: (cc: number) => void;
  setDrawVelocity: (vel: number) => void;
  selectNote: (noteId: string, additive: boolean) => void;
  selectNotes: (noteIds: string[], additive: boolean) => void;
  selectAll: () => void;
  deselectAll: () => void;
  deleteSelected: () => void;
  deleteNote: (noteId: string) => void;
  addNote: (pitch: number, start: number, duration?: number) => void;
  moveNotes: (noteIds: string[], deltaPitch: number, deltaTime: number) => void;
  resizeNote: (noteId: string, newDuration: number) => void;
  setSelectedVelocity: (velocity: number) => void;
  transposeSelected: (semitones: number) => void;
  duplicateSelected: () => void;
  quantizeSelected: () => void;
  setTrackNotes: (trackId: string, notes: EditableNote[]) => void;
  undo: () => void;
  redo: () => void;
  resetToOriginal: (originalNotes: MidiNoteEvent[]) => void;
  addEmptyTrack: () => void;
  removeTrack: (trackId: string) => void;
  setActiveTrack: (trackId: string) => void;
  setTrackName: (trackId: string, name: string) => void;
  setTrackMute: (trackId: string, muted: boolean) => void;
  setTrackSolo: (trackId: string, soloed: boolean) => void;
  setTrackColor: (trackId: string, color: string) => void;
  addCcPoint: (ccNumber: number, time: number, value: number) => void;
  removeCcPoint: (ccNumber: number, pointIndex: number) => void;
  updateCcPoint: (ccNumber: number, pointIndex: number, time: number, value: number) => void;
  setCcLaneVisibility: (ccNumber: number, visible: boolean) => void;
  getTrackCcLane: (ccNumber: number) => CcLane | undefined;
}

export function useMidiEditor(
  initialNotes: MidiNoteEvent[],
  initialBpm: number,
): UseMidiEditorReturn {
  const parsed = notesFromConversion(initialNotes);
  const firstTrack = createInitialTrack(parsed, 0);

  const [state, setState] = useState({
    tracks: [firstTrack],
    activeTrackId: firstTrack.id,
    tool: "select" as EditorTool,
    snapGrid: "1/16" as SnapGrid,
    bpm: initialBpm || 120,
    timeSignature: DEFAULT_TIME_SIG as TimeSignature,
    loopRegion: DEFAULT_LOOP as LoopRegion,
    activeLane: "notes" as ActiveLane,
    activeCcNumber: 1,
    drawVelocity: 80,
    isModified: false,
  });

  const historyRef = useRef<HistoryEntry[]>([
    {
      tracks: [firstTrack],
      activeTrackId: firstTrack.id,
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyLength, setHistoryLength] = useState(1);

  const pushHistory = useCallback(() => {
    const newHistory = historyRef.current.slice(0, historyIndex + 1);
    newHistory.push({
      tracks: state.tracks.map((t) => ({
        ...t,
        notes: t.notes.map((n) => ({ ...n })),
        selectedIds: new Set(t.selectedIds),
        ccLanes: t.ccLanes.map((l) => ({
          ...l,
          events: l.events.map((e) => ({ ...e })),
        })),
      })),
      activeTrackId: state.activeTrackId,
    });
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    historyRef.current = newHistory;
    setHistoryIndex(newHistory.length - 1);
    setHistoryLength(newHistory.length);
  }, [state.tracks, state.activeTrackId, historyIndex]);

  const updateTrack = useCallback(
    (trackId: string, updater: (track: EditorTrack) => EditorTrack) => {
      setState((s) => ({
        ...s,
        tracks: s.tracks.map((t) => (t.id === trackId ? updater(t) : t)),
        isModified: true,
      }));
    },
    [],
  );

  const activeTrack = useMemo(
    () => state.tracks.find((t) => t.id === state.activeTrackId) ?? state.tracks[0],
    [state.tracks, state.activeTrackId],
  );

  const activeTrackNotes = activeTrack.notes;
  const activeTrackSelectedIds = activeTrack.selectedIds;

  const setTool = useCallback((tool: EditorTool) => {
    setState((s) => ({
      ...s,
      tool,
      tracks: s.tracks.map((t) =>
        t.id === s.activeTrackId
          ? { ...t, selectedIds: tool !== "select" ? new Set() : t.selectedIds }
          : t,
      ),
    }));
  }, []);

  const setSnapGrid = useCallback((snapGrid: SnapGrid) => {
    setState((s) => ({ ...s, snapGrid }));
  }, []);

  const setBpm = useCallback((bpm: number) => {
    setState((s) => ({ ...s, bpm: Math.max(40, Math.min(300, bpm)) }));
  }, []);

  const setTimeSignature = useCallback((ts: TimeSignature) => {
    setState((s) => ({ ...s, timeSignature: ts }));
  }, []);

  const setLoopRegion = useCallback((region: LoopRegion) => {
    setState((s) => ({ ...s, loopRegion: region }));
  }, []);

  const setActiveLane = useCallback((lane: ActiveLane) => {
    setState((s) => ({ ...s, activeLane: lane }));
  }, []);

  const setActiveCcNumber = useCallback((cc: number) => {
    setState((s) => ({ ...s, activeCcNumber: cc }));
  }, []);

  const setDrawVelocity = useCallback((drawVelocity: number) => {
    setState((s) => ({ ...s, drawVelocity: Math.max(1, Math.min(127, drawVelocity)) }));
  }, []);

  const modifyActiveTrack = useCallback(
    (updater: (track: EditorTrack) => EditorTrack) => {
      setState((s) => ({
        ...s,
        tracks: s.tracks.map((t) =>
          t.id === s.activeTrackId ? updater(t) : t,
        ),
        isModified: true,
      }));
    },
    [],
  );

  const selectNote = useCallback((noteId: string, additive: boolean) => {
    modifyActiveTrack((track) => {
      const next = new Set(additive ? track.selectedIds : []);
      if (next.has(noteId) && additive) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return { ...track, selectedIds: next };
    });
  }, [modifyActiveTrack]);

  const selectNotes = useCallback((noteIds: string[], additive: boolean) => {
    modifyActiveTrack((track) => {
      const next = new Set(additive ? track.selectedIds : noteIds);
      if (additive) {
        for (const id of noteIds) next.add(id);
      }
      return { ...track, selectedIds: next };
    });
  }, [modifyActiveTrack]);

  const selectAll = useCallback(() => {
    modifyActiveTrack((track) => ({
      ...track,
      selectedIds: new Set(track.notes.map((n) => n.id)),
    }));
  }, [modifyActiveTrack]);

  const deselectAll = useCallback(() => {
    modifyActiveTrack((track) => ({
      ...track,
      selectedIds: new Set(),
    }));
  }, [modifyActiveTrack]);

  const deleteSelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size === 0) return track;
      pushHistory();
      return {
        ...track,
        notes: track.notes.filter((n) => !track.selectedIds.has(n.id)),
        selectedIds: new Set(),
      };
    });
  }, [modifyActiveTrack, pushHistory]);

  const deleteNote = useCallback(
    (noteId: string) => {
      modifyActiveTrack((track) => {
        pushHistory();
        const notes = track.notes.filter((n) => n.id !== noteId);
        const selectedIds = new Set(track.selectedIds);
        selectedIds.delete(noteId);
        return { ...track, notes, selectedIds };
      });
    },
    [modifyActiveTrack, pushHistory],
  );

  const addNote = useCallback(
    (pitch: number, start: number, duration?: number) => {
      modifyActiveTrack((track) => {
        pushHistory();
        const snappedStart = snapToGrid(start, state.bpm, state.snapGrid, state.timeSignature);
        const snappedDuration = duration
          ? snapDuration(duration, state.bpm, state.snapGrid, state.timeSignature)
          : snapDuration(0.25, state.bpm, state.snapGrid, state.timeSignature);
        const newNote: EditableNote = {
          id: generateNoteId(),
          pitch: Math.max(0, Math.min(127, pitch)),
          start: Math.max(0, snappedStart),
          duration: snappedDuration,
          velocity: state.drawVelocity,
        };
        return {
          ...track,
          notes: [...track.notes, newNote],
          selectedIds: new Set([newNote.id]),
        };
      });
    },
    [modifyActiveTrack, pushHistory, state.bpm, state.snapGrid, state.timeSignature, state.drawVelocity],
  );

  const moveNotes = useCallback(
    (noteIds: string[], deltaPitch: number, deltaTime: number) => {
      modifyActiveTrack((track) => {
        pushHistory();
        const idSet = new Set(noteIds);
        return {
          ...track,
          notes: track.notes.map((n) => {
            if (!idSet.has(n.id)) return n;
            const newPitch = Math.max(0, Math.min(127, n.pitch + deltaPitch));
            const snappedDelta = snapDeltaTime(deltaTime, state.bpm, state.snapGrid, state.timeSignature);
            const newStart = Math.max(0, n.start + snappedDelta);
            return { ...n, pitch: newPitch, start: newStart };
          }),
        };
      });
    },
    [modifyActiveTrack, pushHistory, state.bpm, state.snapGrid, state.timeSignature],
  );

  const resizeNote = useCallback(
    (noteId: string, newDuration: number) => {
      modifyActiveTrack((track) => {
        pushHistory();
        return {
          ...track,
          notes: track.notes.map((n) => {
            if (n.id !== noteId) return n;
            const snapped = snapDuration(newDuration, state.bpm, state.snapGrid, state.timeSignature);
            return { ...n, duration: Math.max(0.01, snapped) };
          }),
        };
      });
    },
    [modifyActiveTrack, pushHistory, state.bpm, state.snapGrid, state.timeSignature],
  );

  const setSelectedVelocity = useCallback(
    (velocity: number) => {
      modifyActiveTrack((track) => {
        if (track.selectedIds.size === 0) return track;
        pushHistory();
        const vel = Math.max(1, Math.min(127, velocity));
        return {
          ...track,
          notes: track.notes.map((n) =>
            track.selectedIds.has(n.id) ? { ...n, velocity: vel } : n,
          ),
        };
      });
    },
    [modifyActiveTrack, pushHistory],
  );

  const transposeSelected = useCallback(
    (semitones: number) => {
      modifyActiveTrack((track) => {
        if (track.selectedIds.size === 0) return track;
        pushHistory();
        return {
          ...track,
          notes: track.notes.map((n) => {
            if (!track.selectedIds.has(n.id)) return n;
            return { ...n, pitch: Math.max(0, Math.min(127, n.pitch + semitones)) };
          }),
        };
      });
    },
    [modifyActiveTrack, pushHistory],
  );

  const duplicateSelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size === 0) return track;
      pushHistory();
      const offset = snapDuration(0.25, state.bpm, state.snapGrid, state.timeSignature);
      const duplicates: EditableNote[] = [];
      const newIds = new Set<string>();
      for (const n of track.notes) {
        if (!track.selectedIds.has(n.id)) continue;
        const dup: EditableNote = {
          ...n,
          id: generateNoteId(),
          start: n.start + offset,
        };
        duplicates.push(dup);
        newIds.add(dup.id);
      }
      return {
        ...track,
        notes: [...track.notes, ...duplicates],
        selectedIds: newIds,
      };
    });
  }, [modifyActiveTrack, pushHistory, state.bpm, state.snapGrid, state.timeSignature]);

  const quantizeSelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size === 0) return track;
      pushHistory();
      return {
        ...track,
        notes: track.notes.map((n) => {
          if (!track.selectedIds.has(n.id)) return n;
          return {
            ...n,
            start: snapToGrid(n.start, state.bpm, state.snapGrid, state.timeSignature),
            duration: snapDuration(n.duration, state.bpm, state.snapGrid, state.timeSignature),
          };
        }),
      };
    });
  }, [modifyActiveTrack, pushHistory, state.bpm, state.snapGrid, state.timeSignature]);

  const setTrackNotes = useCallback(
    (trackId: string, notes: EditableNote[]) => {
      updateTrack(trackId, (t) => ({ ...t, notes }));
    },
    [updateTrack],
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIdx = historyIndex - 1;
    const entry = historyRef.current[newIdx];
    setState((s) => ({
      ...s,
      tracks: entry.tracks.map((t) => ({
        ...t,
        notes: t.notes.map((n) => ({ ...n })),
        selectedIds: new Set(t.selectedIds),
        ccLanes: t.ccLanes.map((l) => ({
          ...l,
          events: l.events.map((e) => ({ ...e })),
        })),
      })),
      activeTrackId: entry.activeTrackId,
      isModified: newIdx > 0,
    }));
    setHistoryIndex(newIdx);
    setHistoryLength(historyRef.current.length);
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= historyLength - 1) return;
    const newIdx = historyIndex + 1;
    const entry = historyRef.current[newIdx];
    setState((s) => ({
      ...s,
      tracks: entry.tracks.map((t) => ({
        ...t,
        notes: t.notes.map((n) => ({ ...n })),
        selectedIds: new Set(t.selectedIds),
        ccLanes: t.ccLanes.map((l) => ({
          ...l,
          events: l.events.map((e) => ({ ...e })),
        })),
      })),
      activeTrackId: entry.activeTrackId,
      isModified: true,
    }));
    setHistoryIndex(newIdx);
    setHistoryLength(historyRef.current.length);
  }, [historyIndex, historyLength]);

  const resetToOriginal = useCallback((originalNotes: MidiNoteEvent[]) => {
    const notes = notesFromConversion(originalNotes);
    const track = createInitialTrack(notes, 0);
    historyRef.current = [{ tracks: [track], activeTrackId: track.id }];
    setHistoryIndex(0);
    setState((s) => ({
      ...s,
      tracks: [track],
      activeTrackId: track.id,
      isModified: false,
    }));
  }, []);

  const addEmptyTrack = useCallback(() => {
    const idx = state.tracks.length;
    const track = createInitialTrack([], idx);
    setState((s) => ({
      ...s,
      tracks: [...s.tracks, track],
    }));
  }, [state.tracks.length]);

  const removeTrack = useCallback((trackId: string) => {
    setState((s) => {
      if (s.tracks.length <= 1) return s;
      const tracks = s.tracks.filter((t) => t.id !== trackId);
      const activeTrackId = s.activeTrackId === trackId
        ? tracks[0]?.id ?? s.activeTrackId
        : s.activeTrackId;
      return { ...s, tracks, activeTrackId };
    });
  }, []);

  const setActiveTrack = useCallback((trackId: string) => {
    setState((s) => ({ ...s, activeTrackId: trackId }));
  }, []);

  const setTrackName = useCallback((trackId: string, name: string) => {
    updateTrack(trackId, (t) => ({ ...t, name }));
  }, [updateTrack]);

  const setTrackMute = useCallback((trackId: string, muted: boolean) => {
    updateTrack(trackId, (t) => ({ ...t, muted }));
  }, [updateTrack]);

  const setTrackSolo = useCallback((trackId: string, soloed: boolean) => {
    updateTrack(trackId, (t) => ({ ...t, soloed }));
  }, [updateTrack]);

  const setTrackColor = useCallback((trackId: string, color: string) => {
    updateTrack(trackId, (t) => ({ ...t, color }));
  }, [updateTrack]);

  const getTrackCcLane = useCallback(
    (ccNumber: number): CcLane | undefined => {
      return activeTrack.ccLanes.find((l) => l.ccNumber === ccNumber);
    },
    [activeTrack.ccLanes],
  );

  const addCcPoint = useCallback(
    (ccNumber: number, time: number, value: number) => {
      modifyActiveTrack((track) => {
        const lanes = track.ccLanes.map((l) => {
          if (l.ccNumber !== ccNumber) return l;
          const events = [...l.events, { time, value: Math.max(0, Math.min(127, value)) }];
          events.sort((a, b) => a.time - b.time);
          return { ...l, events };
        });
        return { ...track, ccLanes: lanes };
      });
    },
    [modifyActiveTrack],
  );

  const removeCcPoint = useCallback(
    (ccNumber: number, pointIndex: number) => {
      modifyActiveTrack((track) => {
        const lanes = track.ccLanes.map((l) => {
          if (l.ccNumber !== ccNumber) return l;
          return { ...l, events: l.events.filter((_, i) => i !== pointIndex) };
        });
        return { ...track, ccLanes: lanes };
      });
    },
    [modifyActiveTrack],
  );

  const updateCcPoint = useCallback(
    (ccNumber: number, pointIndex: number, time: number, value: number) => {
      modifyActiveTrack((track) => {
        const lanes = track.ccLanes.map((l) => {
          if (l.ccNumber !== ccNumber) return l;
          return {
            ...l,
            events: l.events.map((e, i) =>
              i === pointIndex
                ? { time, value: Math.max(0, Math.min(127, value)) }
                : e,
            ),
          };
        });
        return { ...track, ccLanes: lanes };
      });
    },
    [modifyActiveTrack],
  );

  const setCcLaneVisibility = useCallback(
    (ccNumber: number, visible: boolean) => {
      modifyActiveTrack((track) => {
        const lanes = track.ccLanes.map((l) => {
          if (l.ccNumber !== ccNumber) return l;
          return { ...l, visible };
        });
        return { ...track, ccLanes: lanes };
      });
    },
    [modifyActiveTrack],
  );

  const selectedNotes = useMemo(
    () => activeTrack.notes.filter((n) => activeTrack.selectedIds.has(n.id)),
    [activeTrack.notes, activeTrack.selectedIds],
  );

  const gridSizeSeconds = useMemo(
    () => getGridSizeSeconds(state.bpm, state.snapGrid, state.timeSignature),
    [state.bpm, state.snapGrid, state.timeSignature],
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;

  return {
    tracks: state.tracks,
    activeTrackId: state.activeTrackId,
    activeTrack,
    notes: activeTrackNotes,
    selectedIds: activeTrackSelectedIds,
    selectedNotes,
    tool: state.tool,
    snapGrid: state.snapGrid,
    bpm: state.bpm,
    timeSignature: state.timeSignature,
    loopRegion: state.loopRegion,
    activeLane: state.activeLane,
    activeCcNumber: state.activeCcNumber,
    drawVelocity: state.drawVelocity,
    isModified: state.isModified,
    canUndo,
    canRedo,
    gridSizeSeconds,
    setTool,
    setSnapGrid,
    setBpm,
    setTimeSignature,
    setLoopRegion,
    setActiveLane,
    setActiveCcNumber,
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
    duplicateSelected,
    quantizeSelected,
    setTrackNotes,
    undo,
    redo,
    resetToOriginal,
    addEmptyTrack,
    removeTrack,
    setActiveTrack,
    setTrackName,
    setTrackMute,
    setTrackSolo,
    setTrackColor,
    addCcPoint,
    removeCcPoint,
    updateCcPoint,
    setCcLaneVisibility,
    getTrackCcLane,
  };
}
