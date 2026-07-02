import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getGridSizeSeconds,
  snapDeltaTime,
  snapDuration,
  snapToGrid,
} from "../utils/midiEditorSnap";
import {
  resolvePitchOverlaps,
  sanitizeSelectedIds,
} from "../utils/midiEditorNotes";
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
  AutomationParam,
  EditorViewState,
  MidiFxApplyMode,
} from "../components/midi-convert/editorTypes";
import {
  DEFAULT_TIME_SIG,
  DEFAULT_LOOP,
  BUILTIN_CC_LANES,
  TRACK_COLORS,
  createDefaultTrackMidiFx,
  DEFAULT_MIDI_FX_APPLY_MODE,
  generateTrackId,
  generateNoteId,
} from "../components/midi-convert/editorTypes";
import type { MidiEffectsConfig } from "../audio/midiEffects/types";
import { cloneMidiEffects } from "../audio/midiEffects/presets";
import {
  constrainPitch,
  type ScaleGuideConstraint,
} from "../utils/musicTheory";

export type {
  EditorTool,
  SnapGrid,
  EditableNote,
  EditorTrack,
  CcLane,
  CcPoint,
  LoopRegion,
  TimeSignature,
  ActiveLane,
  EditorViewState,
  AutomationParam,
};

const MAX_HISTORY = 50;

interface HistoryEntry {
  tracks: EditorTrack[];
  activeTrackId: string;
}

export function notesFromConversion(notes: MidiNoteEvent[]): EditableNote[] {
  return notes.map((n) => ({ ...n, id: generateNoteId() }));
}

export interface MidiEditorInitOptions {
  initialTracks?: EditorTrack[];
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
    instrument: "piano",
    ccLanes: BUILTIN_CC_LANES.map((l) => ({
      ...l,
      events: [],
      visible: false,
    })),
    midiEffects: createDefaultTrackMidiFx(),
    midiFxApplyMode: DEFAULT_MIDI_FX_APPLY_MODE,
    midiFxPreview: false,
  };
}

function withTrackMidiFxDefaults(track: EditorTrack): EditorTrack {
  return {
    ...track,
    midiEffects: track.midiEffects
      ? cloneMidiEffects(track.midiEffects)
      : createDefaultTrackMidiFx(),
    midiFxApplyMode: track.midiFxApplyMode ?? DEFAULT_MIDI_FX_APPLY_MODE,
    midiFxPreview: track.midiFxPreview ?? false,
  };
}

function cloneTrackFromHistory(track: EditorTrack): EditorTrack {
  return withTrackMidiFxDefaults({
    ...track,
    notes: track.notes.map((n) => ({ ...n })),
    selectedIds: new Set(track.selectedIds),
    ccLanes: track.ccLanes.map((l) => ({
      ...l,
      events: l.events.map((e) => ({ ...e })),
    })),
  });
}

function normalizeTrackState(track: EditorTrack): EditorTrack {
  const notes = resolvePitchOverlaps(track.notes);
  return withTrackMidiFxDefaults({
    ...track,
    notes,
    selectedIds: sanitizeSelectedIds(notes, track.selectedIds),
  });
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
  activeAutomationParam: AutomationParam;
  drawVelocity: number;
  isModified: boolean;
  canUndo: boolean;
  canRedo: boolean;
  gridSizeSeconds: number;
  clipboard: EditableNote[];
  setTool: (tool: EditorTool) => void;
  setSnapGrid: (grid: SnapGrid) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (ts: TimeSignature) => void;
  setLoopRegion: (region: LoopRegion) => void;
  setActiveLane: (lane: ActiveLane) => void;
  setActiveCcNumber: (cc: number) => void;
  setActiveAutomationParam: (param: AutomationParam) => void;
  setDrawVelocity: (vel: number) => void;
  selectNote: (noteId: string, additive: boolean) => void;
  selectNotes: (noteIds: string[], additive: boolean) => void;
  selectAll: () => void;
  deselectAll: () => void;
  deleteSelected: () => void;
  deleteNote: (noteId: string) => void;
  addNote: (pitch: number, start: number, duration?: number) => void;
  moveNotes: (noteIds: string[], deltaPitch: number, deltaTime: number) => void;
  resizeNote: (noteId: string, newStart: number, newDuration: number) => void;
  setSelectedVelocity: (velocity: number) => void;
  transposeSelected: (semitones: number) => void;
  moveSelectedByStep: (deltaPitch: number, deltaTime: number) => void;
  duplicateSelected: () => void;
  duplicateNotes: (
    noteIds: string[],
    deltaPitch: number,
    deltaTime: number,
  ) => void;
  quantizeSelected: () => void;
  quantizeNotes: (noteIds: string[]) => void;
  splitNoteAt: (noteId: string, time: number) => void;
  joinSelected: () => void;
  copySelected: () => void;
  cutSelected: () => void;
  pasteClipboard: (pasteTime?: number) => void;
  humanizeSelected: (timingJitter?: number, velocityJitter?: number) => void;
  randomizeSelected: (minVelocity?: number, maxVelocity?: number) => void;
  applyMidiEffectsToNotes: (
    noteIds: string[],
    processed: MidiNoteEvent[],
    mode?: MidiFxApplyMode,
  ) => void;
  setTrackMidiEffects: (trackId: string, config: MidiEffectsConfig) => void;
  setTrackMidiFxApplyMode: (trackId: string, mode: MidiFxApplyMode) => void;
  setTrackMidiFxPreview: (trackId: string, enabled: boolean) => void;
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
  setTrackInstrument: (
    trackId: string,
    instrument: EditorTrack["instrument"],
  ) => void;
  setNoteVelocity: (noteId: string, velocity: number) => void;
  setNoteMuted: (noteId: string, muted: boolean) => void;
  setNoteChannel: (noteId: string, channel: number) => void;
  legatoSelected: () => void;
  beginRecordedNote: (pitch: number, start: number, velocity: number) => string;
  setScaleConstraint: (guide: ScaleGuideConstraint | null) => void;
  markAsSaved: () => void;
  finishRecordedNote: (noteId: string, endAbsolute: number) => void;
  beginEditGesture: () => void;
  addCcPoint: (ccNumber: number, time: number, value: number) => void;
  removeCcPoint: (ccNumber: number, pointIndex: number) => void;
  updateCcPoint: (
    ccNumber: number,
    pointIndex: number,
    time: number,
    value: number,
  ) => void;
  setCcLaneVisibility: (ccNumber: number, visible: boolean) => void;
  getTrackCcLane: (ccNumber: number) => CcLane | undefined;
}

export function useMidiEditor(
  initialNotes: MidiNoteEvent[],
  initialBpm: number,
  options?: MidiEditorInitOptions,
): UseMidiEditorReturn {
  const bootstrapTracks = useMemo(() => {
    if (options?.initialTracks && options.initialTracks.length > 0) {
      return options.initialTracks.map((track) => ({
        ...track,
        notes: track.notes.map((n) => ({ ...n })),
        selectedIds: new Set(track.selectedIds),
        ccLanes: track.ccLanes.map((l) => ({
          ...l,
          events: l.events.map((e) => ({ ...e })),
        })),
      }));
    }
    const parsed = notesFromConversion(initialNotes);
    return [createInitialTrack(parsed, 0)];
  }, [options?.initialTracks, initialNotes]);

  const firstTrack = bootstrapTracks[0];

  const [state, setState] = useState({
    tracks: bootstrapTracks,
    activeTrackId: firstTrack.id,
    tool: "select" as EditorTool,
    snapGrid: "1/16" as SnapGrid,
    bpm: initialBpm || 120,
    timeSignature: DEFAULT_TIME_SIG as TimeSignature,
    loopRegion: DEFAULT_LOOP as LoopRegion,
    activeLane: "notes" as ActiveLane,
    activeCcNumber: 1,
    activeAutomationParam: "volume" as AutomationParam,
    drawVelocity: 80,
    isModified: false,
    clipboard: [] as EditableNote[],
  });

  const scaleConstraintRef = useRef<ScaleGuideConstraint | null>(null);

  const setScaleConstraint = useCallback(
    (guide: ScaleGuideConstraint | null) => {
      scaleConstraintRef.current = guide?.locked ? guide : null;
    },
    [],
  );

  const markAsSaved = useCallback(() => {
    setState((s) => ({ ...s, isModified: false }));
  }, []);

  const historyRef = useRef<HistoryEntry[]>([
    {
      tracks: bootstrapTracks,
      activeTrackId: firstTrack.id,
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyLength, setHistoryLength] = useState(1);

  const stateRef = useRef(state);
  const historyIndexRef = useRef(historyIndex);

  useEffect(() => {
    stateRef.current = state;
    historyIndexRef.current = historyIndex;
  }, [state, historyIndex]);

  const pushHistory = useCallback(() => {
    const s = stateRef.current;
    const idx = historyIndexRef.current;
    const newHistory = historyRef.current.slice(0, idx + 1);
    newHistory.push({
      tracks: s.tracks.map((t) => ({
        ...t,
        notes: t.notes.map((n) => ({ ...n })),
        selectedIds: new Set(t.selectedIds),
        ccLanes: t.ccLanes.map((l) => ({
          ...l,
          events: l.events.map((e) => ({ ...e })),
        })),
      })),
      activeTrackId: s.activeTrackId,
    });
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    historyRef.current = newHistory;
    const newIdx = newHistory.length - 1;
    historyIndexRef.current = newIdx;
    setHistoryIndex(newIdx);
    setHistoryLength(newHistory.length);
  }, []);

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
    () =>
      state.tracks.find((t) => t.id === state.activeTrackId) ?? state.tracks[0],
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

  const setActiveAutomationParam = useCallback((param: AutomationParam) => {
    setState((s) => ({ ...s, activeAutomationParam: param }));
  }, []);

  const setDrawVelocity = useCallback((drawVelocity: number) => {
    setState((s) => ({
      ...s,
      drawVelocity: Math.max(1, Math.min(127, drawVelocity)),
    }));
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

  const selectNote = useCallback(
    (noteId: string, additive: boolean) => {
      modifyActiveTrack((track) => {
        const next = new Set(additive ? track.selectedIds : []);
        if (next.has(noteId) && additive) {
          next.delete(noteId);
        } else {
          next.add(noteId);
        }
        return { ...track, selectedIds: next };
      });
    },
    [modifyActiveTrack],
  );

  const selectNotes = useCallback(
    (noteIds: string[], additive: boolean) => {
      modifyActiveTrack((track) => {
        const next = new Set(additive ? track.selectedIds : noteIds);
        if (additive) {
          for (const id of noteIds) next.add(id);
        }
        return { ...track, selectedIds: next };
      });
    },
    [modifyActiveTrack],
  );

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
        const snappedStart = snapToGrid(
          start,
          state.bpm,
          state.snapGrid,
          state.timeSignature,
        );
        const snappedDuration = duration
          ? snapDuration(
              duration,
              state.bpm,
              state.snapGrid,
              state.timeSignature,
            )
          : snapDuration(0.25, state.bpm, state.snapGrid, state.timeSignature);
        const constrainedPitch = constrainPitch(
          pitch,
          scaleConstraintRef.current,
        );
        const newNote: EditableNote = {
          id: generateNoteId(),
          pitch: Math.max(0, Math.min(127, constrainedPitch)),
          start: Math.max(0, snappedStart),
          duration: snappedDuration,
          velocity: state.drawVelocity,
        };
        return normalizeTrackState({
          ...track,
          notes: [...track.notes, newNote],
          selectedIds: new Set([newNote.id]),
        });
      });
    },
    [
      modifyActiveTrack,
      pushHistory,
      state.bpm,
      state.snapGrid,
      state.timeSignature,
      state.drawVelocity,
    ],
  );

  const moveNotes = useCallback(
    (noteIds: string[], deltaPitch: number, deltaTime: number) => {
      modifyActiveTrack((track) => {
        pushHistory();
        const idSet = new Set(noteIds);
        return normalizeTrackState({
          ...track,
          notes: track.notes.map((n) => {
            if (!idSet.has(n.id)) return n;
            const newPitch = Math.max(
              0,
              Math.min(
                127,
                constrainPitch(
                  n.pitch + deltaPitch,
                  scaleConstraintRef.current,
                ),
              ),
            );
            const snappedDelta = snapDeltaTime(
              deltaTime,
              state.bpm,
              state.snapGrid,
              state.timeSignature,
            );
            const newStart = Math.max(0, n.start + snappedDelta);
            return { ...n, pitch: newPitch, start: newStart };
          }),
        });
      });
    },
    [
      modifyActiveTrack,
      pushHistory,
      state.bpm,
      state.snapGrid,
      state.timeSignature,
    ],
  );

  const resizeNote = useCallback(
    (noteId: string, newStart: number, newDuration: number) => {
      modifyActiveTrack((track) => {
        pushHistory();
        return normalizeTrackState({
          ...track,
          notes: track.notes.map((n) => {
            if (n.id !== noteId) return n;
            const snappedStart = snapToGrid(
              Math.max(0, newStart),
              state.bpm,
              state.snapGrid,
              state.timeSignature,
            );
            const snappedDuration = snapDuration(
              newDuration,
              state.bpm,
              state.snapGrid,
              state.timeSignature,
            );
            return {
              ...n,
              start: Math.max(0, snappedStart),
              duration: Math.max(0.01, snappedDuration),
            };
          }),
        });
      });
    },
    [
      modifyActiveTrack,
      pushHistory,
      state.bpm,
      state.snapGrid,
      state.timeSignature,
    ],
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
        return normalizeTrackState({
          ...track,
          notes: track.notes.map((n) => {
            if (!track.selectedIds.has(n.id)) return n;
            return {
              ...n,
              pitch: Math.max(
                0,
                Math.min(
                  127,
                  constrainPitch(
                    n.pitch + semitones,
                    scaleConstraintRef.current,
                  ),
                ),
              ),
            };
          }),
        });
      });
    },
    [modifyActiveTrack, pushHistory],
  );

  const moveSelectedByStep = useCallback(
    (deltaPitch: number, deltaTime: number) => {
      modifyActiveTrack((track) => {
        if (track.selectedIds.size === 0) return track;
        pushHistory();
        return normalizeTrackState({
          ...track,
          notes: track.notes.map((n) => {
            if (!track.selectedIds.has(n.id)) return n;
            const snappedDelta = snapDeltaTime(
              deltaTime,
              state.bpm,
              state.snapGrid,
              state.timeSignature,
            );
            return {
              ...n,
              pitch: Math.max(
                0,
                Math.min(
                  127,
                  constrainPitch(
                    n.pitch + deltaPitch,
                    scaleConstraintRef.current,
                  ),
                ),
              ),
              start: Math.max(0, n.start + snappedDelta),
            };
          }),
        });
      });
    },
    [
      modifyActiveTrack,
      pushHistory,
      state.bpm,
      state.snapGrid,
      state.timeSignature,
    ],
  );

  const duplicateSelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size === 0) return track;
      pushHistory();
      const offset = snapDuration(
        0.25,
        state.bpm,
        state.snapGrid,
        state.timeSignature,
      );
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
      return normalizeTrackState({
        ...track,
        notes: [...track.notes, ...duplicates],
        selectedIds: newIds,
      });
    });
  }, [
    modifyActiveTrack,
    pushHistory,
    state.bpm,
    state.snapGrid,
    state.timeSignature,
  ]);

  const duplicateNotes = useCallback(
    (noteIds: string[], deltaPitch: number, deltaTime: number) => {
      if (noteIds.length === 0) return;
      modifyActiveTrack((track) => {
        const selected = track.notes.filter((n) => noteIds.includes(n.id));
        if (selected.length === 0) return track;
        pushHistory();
        const snappedDelta = snapDeltaTime(
          deltaTime,
          state.bpm,
          state.snapGrid,
          state.timeSignature,
        );
        const duplicates: EditableNote[] = selected.map((n) => ({
          ...n,
          id: generateNoteId(),
          pitch: Math.max(0, Math.min(127, n.pitch + deltaPitch)),
          start: Math.max(0, n.start + snappedDelta),
        }));
        return normalizeTrackState({
          ...track,
          notes: [...track.notes, ...duplicates],
          selectedIds: new Set(duplicates.map((note) => note.id)),
        });
      });
    },
    [
      modifyActiveTrack,
      pushHistory,
      state.bpm,
      state.snapGrid,
      state.timeSignature,
    ],
  );

  const quantizeSelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size === 0) return track;
      pushHistory();
      return normalizeTrackState({
        ...track,
        notes: track.notes.map((n) => {
          if (!track.selectedIds.has(n.id)) return n;
          return {
            ...n,
            start: snapToGrid(
              n.start,
              state.bpm,
              state.snapGrid,
              state.timeSignature,
            ),
            duration: snapDuration(
              n.duration,
              state.bpm,
              state.snapGrid,
              state.timeSignature,
            ),
          };
        }),
      });
    });
  }, [
    modifyActiveTrack,
    pushHistory,
    state.bpm,
    state.snapGrid,
    state.timeSignature,
  ]);

  const quantizeNotes = useCallback(
    (noteIds: string[]) => {
      if (noteIds.length === 0) return;
      const idSet = new Set(noteIds);
      modifyActiveTrack((track) => {
        const hasMatch = track.notes.some((n) => idSet.has(n.id));
        if (!hasMatch) return track;
        pushHistory();
        return normalizeTrackState({
          ...track,
          notes: track.notes.map((n) => {
            if (!idSet.has(n.id)) return n;
            return {
              ...n,
              start: snapToGrid(
                n.start,
                state.bpm,
                state.snapGrid,
                state.timeSignature,
              ),
              duration: snapDuration(
                n.duration,
                state.bpm,
                state.snapGrid,
                state.timeSignature,
              ),
            };
          }),
        });
      });
    },
    [
      modifyActiveTrack,
      pushHistory,
      state.bpm,
      state.snapGrid,
      state.timeSignature,
    ],
  );

  const copySelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size === 0) return track;
      const copied = track.notes
        .filter((n) => track.selectedIds.has(n.id))
        .map((n) => ({ ...n, id: generateNoteId() }));
      setState((s) => ({ ...s, clipboard: copied }));
      return track;
    });
  }, [modifyActiveTrack]);

  const cutSelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size === 0) return track;
      pushHistory();
      const copied = track.notes
        .filter((n) => track.selectedIds.has(n.id))
        .map((n) => ({ ...n, id: generateNoteId() }));
      setState((s) => ({ ...s, clipboard: copied }));
      return {
        ...track,
        notes: track.notes.filter((n) => !track.selectedIds.has(n.id)),
        selectedIds: new Set(),
      };
    });
  }, [modifyActiveTrack, pushHistory]);

  const gridSizeSeconds = useMemo(
    () => getGridSizeSeconds(state.bpm, state.snapGrid, state.timeSignature),
    [state.bpm, state.snapGrid, state.timeSignature],
  );

  const pasteClipboard = useCallback(
    (pasteTime?: number) => {
      if (state.clipboard.length === 0) return;
      pushHistory();
      modifyActiveTrack((track) => {
        const clipMin = Math.min(...state.clipboard.map((n) => n.start));
        const trackMaxEnd = track.notes.length
          ? Math.max(...track.notes.map((n) => n.start + n.duration))
          : 0;
        const targetStart = pasteTime ?? trackMaxEnd + gridSizeSeconds;
        const newNotes = state.clipboard.map((n) => ({
          ...n,
          id: generateNoteId(),
          start: Math.max(0, targetStart + (n.start - clipMin)),
        }));
        const newIds = new Set(newNotes.map((n) => n.id));
        return normalizeTrackState({
          ...track,
          notes: [...track.notes, ...newNotes],
          selectedIds: newIds,
        });
      });
    },
    [modifyActiveTrack, pushHistory, state.clipboard, gridSizeSeconds],
  );

  const splitNoteAt = useCallback(
    (noteId: string, time: number) => {
      modifyActiveTrack((track) => {
        const note = track.notes.find((n) => n.id === noteId);
        if (!note) return track;
        if (time <= note.start || time >= note.start + note.duration)
          return track;
        pushHistory();
        const leftDuration = time - note.start;
        const rightStart = time;
        const rightDuration = note.start + note.duration - time;
        if (leftDuration < 0.01 || rightDuration < 0.01) return track;
        const leftNote: EditableNote = {
          ...note,
          id: generateNoteId(),
          duration: leftDuration,
        };
        const rightNote: EditableNote = {
          ...note,
          id: generateNoteId(),
          start: rightStart,
          duration: rightDuration,
        };
        return {
          ...track,
          notes: [
            ...track.notes.filter((n) => n.id !== noteId),
            leftNote,
            rightNote,
          ],
          selectedIds: new Set([leftNote.id, rightNote.id]),
        };
      });
    },
    [modifyActiveTrack, pushHistory],
  );

  const joinSelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size < 2) return track;
      pushHistory();
      const selected = track.notes.filter((n) => track.selectedIds.has(n.id));
      if (selected.length < 2) return track;
      selected.sort((a, b) => a.start - b.start);
      const minPitch = Math.min(...selected.map((n) => n.pitch));
      const maxPitch = Math.max(...selected.map((n) => n.pitch));
      if (minPitch !== maxPitch) return track;
      for (let i = 1; i < selected.length; i++) {
        const prev = selected[i - 1];
        const curr = selected[i];
        if (Math.abs(curr.start - (prev.start + prev.duration)) > 0.01)
          return track;
      }
      const minStart = selected[0].start;
      const maxEnd = Math.max(...selected.map((n) => n.start + n.duration));
      const mergedNote: EditableNote = {
        ...selected[0],
        id: generateNoteId(),
        start: minStart,
        duration: maxEnd - minStart,
      };
      const excludeIds = new Set(selected.map((n) => n.id));
      return {
        ...track,
        notes: [
          ...track.notes.filter((n) => !excludeIds.has(n.id)),
          mergedNote,
        ],
        selectedIds: new Set([mergedNote.id]),
      };
    });
  }, [modifyActiveTrack, pushHistory]);

  const humanizeSelected = useCallback(
    (timingJitter = 0.008, velocityJitter = 10) => {
      modifyActiveTrack((track) => {
        if (track.selectedIds.size === 0) return track;
        pushHistory();
        return normalizeTrackState({
          ...track,
          notes: track.notes.map((n) => {
            if (!track.selectedIds.has(n.id)) return n;
            const timeOffset = (Math.random() - 0.5) * 2 * timingJitter;
            const velOffset = Math.round(
              (Math.random() - 0.5) * 2 * velocityJitter,
            );
            return {
              ...n,
              start: Math.max(0, n.start + timeOffset),
              velocity: Math.max(1, Math.min(127, n.velocity + velOffset)),
            };
          }),
        });
      });
    },
    [modifyActiveTrack, pushHistory],
  );

  const randomizeSelected = useCallback(
    (minVelocity = 30, maxVelocity = 127) => {
      modifyActiveTrack((track) => {
        if (track.selectedIds.size === 0) return track;
        pushHistory();
        return {
          ...track,
          notes: track.notes.map((n) => {
            if (!track.selectedIds.has(n.id)) return n;
            const rVel =
              minVelocity +
              Math.round(Math.random() * (maxVelocity - minVelocity));
            return { ...n, velocity: Math.max(1, Math.min(127, rVel)) };
          }),
        };
      });
    },
    [modifyActiveTrack, pushHistory],
  );

  const applyMidiEffectsToNotes = useCallback(
    (
      noteIds: string[],
      processed: MidiNoteEvent[],
      mode: MidiFxApplyMode = DEFAULT_MIDI_FX_APPLY_MODE,
    ) => {
      if (processed.length === 0) return;
      modifyActiveTrack((track) => {
        const idSet = new Set(
          noteIds.length > 0 ? noteIds : track.notes.map((n) => n.id),
        );
        const sourceNotes = track.notes.filter((n) => idSet.has(n.id));
        if (sourceNotes.length === 0) return track;

        pushHistory();
        const transformed: EditableNote[] = processed.map((note) => ({
          ...note,
          id: generateNoteId(),
        }));
        const remaining =
          mode === "replace"
            ? track.notes.filter((n) => !idSet.has(n.id))
            : track.notes;

        return normalizeTrackState({
          ...track,
          notes: [...remaining, ...transformed],
          selectedIds: new Set(transformed.map((n) => n.id)),
        });
      });
    },
    [modifyActiveTrack, pushHistory],
  );

  const setTrackMidiEffects = useCallback(
    (trackId: string, config: MidiEffectsConfig) => {
      updateTrack(trackId, (track) => ({
        ...track,
        midiEffects: cloneMidiEffects(config),
      }));
    },
    [updateTrack],
  );

  const setTrackMidiFxApplyMode = useCallback(
    (trackId: string, mode: MidiFxApplyMode) => {
      updateTrack(trackId, (track) => ({ ...track, midiFxApplyMode: mode }));
    },
    [updateTrack],
  );

  const setTrackMidiFxPreview = useCallback(
    (trackId: string, enabled: boolean) => {
      updateTrack(trackId, (track) => ({ ...track, midiFxPreview: enabled }));
    },
    [updateTrack],
  );

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
      tracks: entry.tracks.map((t) => cloneTrackFromHistory(t)),
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
      tracks: entry.tracks.map((t) => cloneTrackFromHistory(t)),
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
      const activeTrackId =
        s.activeTrackId === trackId
          ? (tracks[0]?.id ?? s.activeTrackId)
          : s.activeTrackId;
      return { ...s, tracks, activeTrackId };
    });
  }, []);

  const setActiveTrack = useCallback((trackId: string) => {
    setState((s) => ({ ...s, activeTrackId: trackId }));
  }, []);

  const setTrackName = useCallback(
    (trackId: string, name: string) => {
      updateTrack(trackId, (t) => ({ ...t, name }));
    },
    [updateTrack],
  );

  const setTrackMute = useCallback(
    (trackId: string, muted: boolean) => {
      updateTrack(trackId, (t) => ({ ...t, muted }));
    },
    [updateTrack],
  );

  const setTrackSolo = useCallback(
    (trackId: string, soloed: boolean) => {
      updateTrack(trackId, (t) => ({ ...t, soloed }));
    },
    [updateTrack],
  );

  const setTrackColor = useCallback(
    (trackId: string, color: string) => {
      updateTrack(trackId, (t) => ({ ...t, color }));
    },
    [updateTrack],
  );

  const setTrackInstrument = useCallback(
    (trackId: string, instrument: EditorTrack["instrument"]) => {
      updateTrack(trackId, (t) => ({ ...t, instrument }));
    },
    [updateTrack],
  );

  const beginEditGesture = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const beginRecordedNote = useCallback(
    (pitch: number, start: number, velocity: number): string => {
      pushHistory();
      const noteId = generateNoteId();
      const minDur =
        getGridSizeSeconds(state.bpm, state.snapGrid, state.timeSignature) ||
        0.01;
      modifyActiveTrack((track) => {
        const snappedStart = snapToGrid(
          start,
          state.bpm,
          state.snapGrid,
          state.timeSignature,
        );
        const constrainedPitch = constrainPitch(
          pitch,
          scaleConstraintRef.current,
        );
        const newNote: EditableNote = {
          id: noteId,
          pitch: Math.max(0, Math.min(127, constrainedPitch)),
          start: Math.max(0, snappedStart),
          duration: minDur,
          velocity: Math.max(1, Math.min(127, velocity)),
        };
        return normalizeTrackState({
          ...track,
          notes: [...track.notes, newNote],
          selectedIds: new Set([noteId]),
        });
      });
      return noteId;
    },
    [
      modifyActiveTrack,
      pushHistory,
      state.bpm,
      state.snapGrid,
      state.timeSignature,
    ],
  );

  const finishRecordedNote = useCallback(
    (noteId: string, endAbsolute: number) => {
      modifyActiveTrack((track) => {
        const note = track.notes.find((n) => n.id === noteId);
        if (!note) return track;
        const gridMin =
          getGridSizeSeconds(state.bpm, state.snapGrid, state.timeSignature) ||
          0.01;
        const snappedEnd = Math.max(
          note.start + gridMin,
          snapToGrid(
            endAbsolute,
            state.bpm,
            state.snapGrid,
            state.timeSignature,
          ),
        );
        const duration = snapDuration(
          snappedEnd - note.start,
          state.bpm,
          state.snapGrid,
          state.timeSignature,
        );
        return normalizeTrackState({
          ...track,
          notes: track.notes.map((n) =>
            n.id === noteId
              ? { ...n, duration: Math.max(gridMin, duration) }
              : n,
          ),
        });
      });
    },
    [modifyActiveTrack, state.bpm, state.snapGrid, state.timeSignature],
  );

  const setNoteVelocity = useCallback(
    (noteId: string, velocity: number) => {
      modifyActiveTrack((track) => ({
        ...track,
        notes: track.notes.map((n) =>
          n.id === noteId
            ? { ...n, velocity: Math.max(1, Math.min(127, velocity)) }
            : n,
        ),
      }));
    },
    [modifyActiveTrack],
  );

  const setNoteMuted = useCallback(
    (noteId: string, muted: boolean) => {
      modifyActiveTrack((track) => ({
        ...track,
        notes: track.notes.map((n) => (n.id === noteId ? { ...n, muted } : n)),
      }));
    },
    [modifyActiveTrack],
  );

  const setNoteChannel = useCallback(
    (noteId: string, channel: number) => {
      modifyActiveTrack((track) => ({
        ...track,
        notes: track.notes.map((n) =>
          n.id === noteId
            ? { ...n, channel: Math.max(1, Math.min(16, Math.round(channel))) }
            : n,
        ),
      }));
    },
    [modifyActiveTrack],
  );

  const legatoSelected = useCallback(() => {
    modifyActiveTrack((track) => {
      if (track.selectedIds.size === 0) return track;
      const selected = track.notes.filter((n) => track.selectedIds.has(n.id));
      if (selected.length === 0) return track;
      pushHistory();

      const nextDurations = new Map<string, number>();
      const byPitch = new Map<number, EditableNote[]>();
      for (const note of selected) {
        const bucket = byPitch.get(note.pitch) ?? [];
        bucket.push(note);
        byPitch.set(note.pitch, bucket);
      }

      for (const group of byPitch.values()) {
        const sorted = [...group].sort((a, b) => a.start - b.start);
        for (let i = 0; i < sorted.length - 1; i++) {
          const current = sorted[i];
          const next = sorted[i + 1];
          nextDurations.set(
            current.id,
            Math.max(0.01, next.start - current.start),
          );
        }
      }

      return {
        ...track,
        notes: track.notes.map((n) => {
          const duration = nextDurations.get(n.id);
          return duration == null ? n : { ...n, duration };
        }),
      };
    });
  }, [modifyActiveTrack, pushHistory]);

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
          const events = [
            ...l.events,
            { time, value: Math.max(0, Math.min(127, value)) },
          ];
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
    activeAutomationParam: state.activeAutomationParam,
    drawVelocity: state.drawVelocity,
    isModified: state.isModified,
    canUndo,
    canRedo,
    gridSizeSeconds,
    clipboard: state.clipboard,
    setTool,
    setSnapGrid,
    setBpm,
    setTimeSignature,
    setLoopRegion,
    setActiveLane,
    setActiveCcNumber,
    setActiveAutomationParam,
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
    moveSelectedByStep,
    duplicateSelected,
    duplicateNotes,
    quantizeSelected,
    quantizeNotes,
    splitNoteAt,
    joinSelected,
    copySelected,
    cutSelected,
    pasteClipboard,
    humanizeSelected,
    randomizeSelected,
    applyMidiEffectsToNotes,
    setTrackMidiEffects,
    setTrackMidiFxApplyMode,
    setTrackMidiFxPreview,
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
    setTrackInstrument,
    setNoteVelocity,
    setNoteMuted,
    setNoteChannel,
    legatoSelected,
    beginRecordedNote,
    setScaleConstraint,
    markAsSaved,
    finishRecordedNote,
    beginEditGesture,
    addCcPoint,
    removeCcPoint,
    updateCcPoint,
    setCcLaneVisibility,
    getTrackCcLane,
  };
}
