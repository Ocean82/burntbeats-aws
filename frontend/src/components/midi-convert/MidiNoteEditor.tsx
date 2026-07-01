import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import {
  applyMidiEffects,
  hasActiveMidiEffects,
  previewNotesWithMidiFx,
} from "../../audio/midiEffects";
import { useMidiEditor } from "../../hooks/useMidiEditor";
import { useMidiPlayback } from "../../hooks/useMidiPlayback";
import { useMidiInstruments } from "../../hooks/useMidiInstruments";
import { authHeaders } from "../../api/auth";
import { API_BASE } from "../../config";
import { exportTracksToMidi, downloadMidiBlob, midiMarkerExportSupported } from "../../utils/midiExport";
import { buildMidiDownloadName } from "../../utils/midiErrors";
import { useWebMidiInput } from "../../hooks/useWebMidiInput";
import { snapToGrid } from "../../utils/midiEditorSnap";
import { MidiControlBar } from "./MidiControlBar";
import { MidiEditorCanvas } from "./MidiEditorCanvas";
import { MidiEditorSelectionInfo } from "./MidiEditorSelectionInfo";
import { MidiEditorShell } from "./MidiEditorShell";
import { MarkerStrip, createMarker, type SectionMarker } from "./MarkerStrip";
import { MidiSmartPanel } from "./MidiSmartPanel";
import { MidiEffectsPanel } from "./MidiEffectsPanel";
import { MidiHarmonyPanel } from "./MidiHarmonyPanel";
import { MidiProcessDialog } from "./MidiProcessDialog";
import { MidiVelocityLane } from "./MidiVelocityLane";
import { MidiCcLane } from "./MidiCcLane";
import { MidiAutomationLane } from "./MidiAutomationLane";
import { MidiTrackList } from "./MidiTrackList";
import { MidiInspectorSection } from "./MidiInspectorSection";
import { MidiRenderAudioControl } from "./MidiRenderAudioControl";
import { clampEditorVerticalZoom, clampEditorZoom } from "./pianoRollTheme";
import {
  useMidiTimelineLayout,
  useTimelineViewportWidth,
} from "./useMidiTimelineLayout";
import type { LoopRegion } from "./editorTypes";
import { midiToFreq, parseEstimatedKey, type RootNote, type Scale } from "../../utils/musicTheory";
import { AUTOMATION_PARAMS } from "./editorTypes";
import { MidiLaneDrawer } from "./MidiLaneDrawer";

interface MidiNoteEditorProps {
  initialNotes: MidiNoteEvent[];
  bpm: number;
  jobId?: string | null;
  jobToken?: string | null;
  sourceLabel?: string;
  estimatedKey?: string;
  isDrumContent?: boolean;
  className?: string;
  e2eMode?: boolean;
  onRegisterEditor?: (api: {
    setBpm: (bpm: number) => void;
    quantizeSelected: () => void;
    hasSelection: () => boolean;
  }) => void;
}

export function MidiNoteEditor({
  initialNotes,
  bpm,
  jobId = null,
  jobToken = null,
  sourceLabel,
  estimatedKey,
  isDrumContent = false,
  className = "",
  e2eMode = false,
  onRegisterEditor,
}: MidiNoteEditorProps) {
  const editor = useMidiEditor(initialNotes, bpm);
  const playback = useMidiPlayback();
  const { getSynth } = useMidiInstruments();
  const containerRef = useRef<HTMLDivElement>(null);
  const laneScrollRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [verticalZoomLevel, setVerticalZoomLevel] = useState(1);
  const [laneDrawerOpen, setLaneDrawerOpen] = useState(true);
  const [fxApplyToAll, setFxApplyToAll] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState({
    selection: true,
    render: false,
    fx: false,
    chords: false,
    harmony: false,
  });
  const anyInspectorOpen = Object.values(inspectorOpen).some(Boolean);
  const [scaleGuide, setScaleGuide] = useState<{
    root: RootNote;
    scale: Scale;
    locked: boolean;
  }>({ root: "C", scale: "major", locked: true });
  const viewportWidth = useTimelineViewportWidth(containerRef);
  const {
    minStart,
    duration,
    totalDuration,
    pixelsPerSecond,
    timelineWidth,
  } = useMidiTimelineLayout(editor.notes, zoomLevel, viewportWidth);
  const [markers, setMarkers] = useState<SectionMarker[]>([]);
  const [markerExportNotice, setMarkerExportNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);

  const handleProcess = useCallback(
    (processedNotes: import("./editorTypes").EditableNote[]) => {
      editor.beginEditGesture();
      editor.setTrackNotes(editor.activeTrackId, processedNotes);
    },
    [editor],
  );

  useEffect(() => {
    if (isDrumContent) {
      editor.setScaleConstraint(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync derived state when drum detection changes
      setScaleGuide((prev) => ({ ...prev, locked: false }));
      return;
    }
    editor.setScaleConstraint(scaleGuide.locked ? scaleGuide : null);
  }, [editor, scaleGuide, isDrumContent]);

  useEffect(() => {
    if (!estimatedKey || isDrumContent) return;
    const parsed = parseEstimatedKey(estimatedKey);
    if (!parsed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: initialize scale guide from server-provided key estimate
    setScaleGuide((prev) => ({ ...prev, ...parsed }));
  }, [estimatedKey, isDrumContent]);

  useEffect(() => {
    onRegisterEditor?.({
      setBpm: editor.setBpm,
      quantizeSelected: editor.quantizeSelected,
      hasSelection: () => editor.selectedNotes.length > 0,
    });
  }, [
    editor.setBpm,
    editor.quantizeSelected,
    editor.selectedNotes.length,
    onRegisterEditor,
  ]);

  useEffect(() => {
    if (!editor.isModified) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor.isModified]);

  useEffect(() => {
    if (editor.selectedNotes.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: auto-expand inspector on selection for discoverability
      setInspectorOpen((prev) => ({ ...prev, selection: true }));
    }
  }, [editor.selectedNotes.length]);

  const lastAuditionRef = useRef<{ key: string; time: number }>({
    key: "",
    time: 0,
  });

  const playheadTime = useMemo(() => {
    if (
      playback.currentTime <= 0 &&
      !playback.isPlaying &&
      !playback.isPaused
    ) {
      return null;
    }
    return minStart + playback.currentTime;
  }, [minStart, playback.isPlaying, playback.isPaused, playback.currentTime]);

  const activeMidiFx = editor.activeTrack.midiEffects;
  const activeMidiFxApplyMode = editor.activeTrack.midiFxApplyMode;
  const activeMidiFxPreview = editor.activeTrack.midiFxPreview;

  const playbackTracks = useMemo(
    () =>
      editor.tracks.map((t) => {
        const baseNotes = t.notes.map((n) => ({
          pitch: n.pitch,
          start: n.start,
          duration: n.duration,
          velocity: n.velocity,
          muted: n.muted,
        }));
        const notes =
          t.midiFxPreview && hasActiveMidiEffects(t.midiEffects)
            ? previewNotesWithMidiFx(baseNotes, t.midiEffects, editor.bpm)
            : baseNotes;

        return {
          id: t.id,
          notes,
          muted: t.muted,
          soloed: t.soloed,
          instrument: t.instrument,
        };
      }),
    [editor.tracks, editor.bpm],
  );

  const playbackOptions = useMemo(
    () => ({
      bpm: editor.bpm,
      loopRegion: editor.loopRegion.enabled ? editor.loopRegion : undefined,
    }),
    [editor.bpm, editor.loopRegion],
  );

  const handlePlay = useCallback(() => {
    playback.play(playbackTracks, playbackOptions);
  }, [playback, playbackTracks, playbackOptions]);

  interface ActiveRecordedNote {
    noteId: string;
    start: number;
    pitch: number;
  }

  const activeNotesRef = useRef<Map<number, ActiveRecordedNote>>(new Map());
  const editorRef = useRef(editor);
  const playbackRef = useRef(playback);
  const minStartRef = useRef(minStart);
  const midiArmedRef = useRef(false);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    minStartRef.current = minStart;
  }, [minStart]);

  const recordAbsoluteTime = useCallback(
    () => playbackRef.current.currentTime + minStartRef.current,
    [],
  );

  const finalizeRecordedPitch = useCallback(
    (pitch: number, endAbsolute?: number) => {
      const active = activeNotesRef.current.get(pitch);
      if (!active) return;
      const end = endAbsolute ?? recordAbsoluteTime();
      editorRef.current.finishRecordedNote(active.noteId, end);
      activeNotesRef.current.delete(pitch);
    },
    [recordAbsoluteTime],
  );

  const finalizeAllRecorded = useCallback(() => {
    const end = recordAbsoluteTime();
    for (const pitch of [...activeNotesRef.current.keys()]) {
      finalizeRecordedPitch(pitch, end);
    }
  }, [finalizeRecordedPitch, recordAbsoluteTime]);

  const webMidi = useWebMidiInput({
    onNoteOn: (pitch, velocity) => {
      if (!midiArmedRef.current) return;
      if (!playbackRef.current.isPlaying) return;

      finalizeRecordedPitch(pitch);

      const start = snapToGrid(
        recordAbsoluteTime(),
        editorRef.current.bpm,
        editorRef.current.snapGrid,
        editorRef.current.timeSignature,
      );
      const noteId = editorRef.current.beginRecordedNote(
        pitch,
        start,
        velocity,
      );
      activeNotesRef.current.set(pitch, { noteId, start, pitch });
    },
    onNoteOff: (pitch) => {
      if (!midiArmedRef.current) return;
      finalizeRecordedPitch(pitch);
    },
  });

  useEffect(() => {
    midiArmedRef.current = webMidi.isEnabled;
  }, [webMidi.isEnabled]);

  const handleStop = useCallback(() => {
    finalizeAllRecorded();
    playback.stop();
  }, [playback, finalizeAllRecorded]);

  const handlePause = useCallback(() => {
    finalizeAllRecorded();
    playback.pause();
  }, [playback, finalizeAllRecorded]);

  const handleSeek = useCallback(
    (time: number) => {
      if (playback.isPlaying || playback.isPaused) {
        playback.seek(time);
      } else {
        playback.seek(time);
      }
    },
    [playback],
  );

  const handleToggleLoop = useCallback(() => {
    editor.setLoopRegion({
      ...editor.loopRegion,
      enabled: !editor.loopRegion.enabled,
    });
  }, [editor]);

  const handleLoopChange = useCallback(
    (region: LoopRegion) => {
      editor.setLoopRegion(region);
    },
    [editor],
  );

  const applyMarkerExportNotice = useCallback((exported: number, requested: number) => {
    if (requested === 0) {
      setMarkerExportNotice(null);
      return;
    }
    if (!midiMarkerExportSupported()) {
      setMarkerExportNotice(
        "Markers are session-only in this browser — MIDI marker export is unavailable.",
      );
      return;
    }
    if (exported < requested) {
      setMarkerExportNotice(
        `Exported ${exported} of ${requested} markers. Some markers may not appear in your DAW.`,
      );
      return;
    }
    setMarkerExportNotice(
      `Exported ${exported} section marker${exported === 1 ? "" : "s"} with your MIDI file.`,
    );
  }, []);

  const handleExport = useCallback(() => {
    const { blob, markersExported, markersRequested } = exportTracksToMidi(
      editor.tracks,
      editor.bpm,
      { markers },
    );
    applyMarkerExportNotice(markersExported, markersRequested);
    const filename = buildMidiDownloadName({
      stemName: sourceLabel ? `${sourceLabel}-edited` : "edited-transcription",
      jobId,
    });
    downloadMidiBlob(blob, filename);
    editor.markAsSaved();
  }, [editor, markers, sourceLabel, jobId, applyMarkerExportNotice]);

  const handleSaveToJob = useCallback(async () => {
    if (!jobId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const { blob, markersExported, markersRequested } = exportTracksToMidi(
        editor.tracks,
        editor.bpm,
        { markers },
      );
      applyMarkerExportNotice(markersExported, markersRequested);
      const headers = await authHeaders();
      const putHeaders: Record<string, string> = {
        ...headers,
        "Content-Type": "audio/midi",
      };
      if (jobToken) putHeaders["x-job-token"] = jobToken;
      const res = await fetch(`${API_BASE}/api/midi/file/${jobId}/output.mid`, {
        method: "PUT",
        headers: putHeaders,
        body: blob,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save MIDI");
      }
      editor.markAsSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [jobId, jobToken, editor, markers, applyMarkerExportNotice]);

  const handleReset = useCallback(() => {
    playback.stop();
    editor.resetToOriginal(initialNotes);
    setMarkers([]);
  }, [editor, initialNotes, playback]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((z) => clampEditorZoom(z + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((z) => clampEditorZoom(z - 0.25));
  }, []);

  const handleZoomLevelChange = useCallback((level: number) => {
    setZoomLevel(clampEditorZoom(level));
  }, []);

  const handleVerticalZoomLevelChange = useCallback((level: number) => {
    setVerticalZoomLevel(clampEditorVerticalZoom(level));
  }, []);

  const handleAddMarker = useCallback((time: number, label: string) => {
    setMarkers((prev) => [...prev, createMarker(time, label)]);
  }, []);

  const handleRemoveMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const defaultMarkerTime = useMemo(() => {
    const playhead = minStart + playback.currentTime;
    return snapToGrid(
      playhead,
      editor.bpm,
      editor.snapGrid,
      editor.timeSignature,
    );
  }, [
    minStart,
    playback.currentTime,
    editor.bpm,
    editor.snapGrid,
    editor.timeSignature,
  ]);

  const effectsTargetNotes = useMemo(() => {
    if (editor.selectedNotes.length > 0) return editor.selectedNotes;
    if (fxApplyToAll) return editor.notes;
    return [];
  }, [editor.selectedNotes, editor.notes, fxApplyToAll]);

  const handleApplyMidiEffects = useCallback(() => {
    const targets = effectsTargetNotes;
    if (targets.length === 0) return;

    const processed = applyMidiEffects(
      targets.map((n) => ({
        pitch: n.pitch,
        start: n.start,
        duration: n.duration,
        velocity: n.velocity,
      })),
      activeMidiFx,
      editor.bpm,
    );

    editor.applyMidiEffectsToNotes(
      targets.map((n) => n.id),
      processed,
      activeMidiFxApplyMode,
    );
  }, [editor, effectsTargetNotes, activeMidiFx, activeMidiFxApplyMode]);

  const handleMidiFxChange = useCallback(
    (config: typeof activeMidiFx) => {
      editor.setTrackMidiEffects(editor.activeTrackId, config);
    },
    [editor],
  );

  const handleMidiFxPreset = useCallback(
    (config: typeof activeMidiFx) => {
      editor.setTrackMidiEffects(editor.activeTrackId, config);
    },
    [editor],
  );

  useEffect(() => {
    if (!activeMidiFxPreview || !hasActiveMidiEffects(activeMidiFx)) return;
    if (!playback.isPlaying) return;

    playback.refresh(playbackTracks, playbackOptions);
  }, [
    activeMidiFx,
    activeMidiFxPreview,
    playback,
    playbackTracks,
    playbackOptions,
  ]);

  const handleInsertChord = useCallback(
    (midiNotes: number[]) => {
      const start = editor.selectedNotes.length
        ? Math.min(...editor.selectedNotes.map((n) => n.start))
        : snapToGrid(
            minStart + playback.currentTime,
            editor.bpm,
            editor.snapGrid,
            editor.timeSignature,
          );
      for (const pitch of midiNotes) {
        editor.addNote(pitch, start);
      }
    },
    [editor, minStart, playback.currentTime],
  );

  const handleInsertProgression = useCallback(
    (chordSets: number[][]) => {
      const base = editor.selectedNotes.length
        ? Math.min(...editor.selectedNotes.map((n) => n.start))
        : snapToGrid(
            minStart + playback.currentTime,
            editor.bpm,
            editor.snapGrid,
            editor.timeSignature,
          );
      const beatsPerChord = 2;
      const secondsPerBeat = 60 / editor.bpm;
      chordSets.forEach((chord, i) => {
        const start = base + i * beatsPerChord * secondsPerBeat;
        for (const pitch of chord) {
          editor.addNote(pitch, start);
        }
      });
    },
    [editor, minStart, playback.currentTime],
  );

  const handleSetNoteVelocity = useCallback(
    (noteId: string, velocity: number) => {
      editor.setNoteVelocity(noteId, velocity);
    },
    [editor],
  );

  const handleAuditionNotes = useCallback(
    async (
      notesToPreview: Array<{
        pitch: number;
        duration: number;
        velocity: number;
      }>,
    ) => {
      if (!notesToPreview.length) return;
      const key = notesToPreview
        .map(
          (note) =>
            `${note.pitch}:${note.duration.toFixed(3)}:${note.velocity}`,
        )
        .join("|");
      const now = performance.now();
      if (
        lastAuditionRef.current.key === key &&
        now - lastAuditionRef.current.time < 80
      ) {
        return;
      }
      lastAuditionRef.current = { key, time: now };

      const synth = await getSynth(
        editor.activeTrackId,
        editor.activeTrack.instrument,
      );
      for (const note of notesToPreview) {
        synth.triggerAttackRelease(
          midiToFreq(note.pitch),
          Math.max(0.06, Math.min(note.duration, 0.25)),
          undefined,
          Math.max(0.12, Math.min(1, note.velocity / 127)),
        );
      }
    },
    [editor.activeTrack.instrument, editor.activeTrackId, getSynth],
  );

  const handleTimelineScroll = useCallback((scrollLeft: number) => {
    if (
      laneScrollRef.current &&
      laneScrollRef.current.scrollLeft !== scrollLeft
    ) {
      laneScrollRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  const handleLaneScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const left = e.currentTarget.scrollLeft;
      const el = timelineScrollRef.current;
      if (el && el.scrollLeft !== left) {
        el.scrollLeft = left;
      }
    },
    [timelineScrollRef],
  );

  const handleAddCcPoint = useCallback(
    (time: number, value: number) => {
      editor.addCcPoint(editor.activeCcNumber, time, value);
    },
    [editor],
  );

  const handleUpdateCcPoint = useCallback(
    (index: number, time: number, value: number) => {
      editor.updateCcPoint(editor.activeCcNumber, index, time, value);
    },
    [editor],
  );

  const handleRemoveCcPoint = useCallback(
    (index: number) => {
      editor.removeCcPoint(editor.activeCcNumber, index);
    },
    [editor],
  );

  const activeCcLane = useMemo(
    () => editor.getTrackCcLane(editor.activeCcNumber),
    [editor],
  );

  const showVelocityLane = editor.activeLane === "velocity";
  const showCcLane = editor.activeLane === "cc" && activeCcLane;
  const automationMeta = AUTOMATION_PARAMS.find(
    (p) => p.param === editor.activeAutomationParam,
  );
  const automationCcLane = useMemo(() => {
    if (!automationMeta) return undefined;
    return editor.getTrackCcLane(automationMeta.ccNumber);
  }, [editor, automationMeta]);
  const showAutomationLane =
    editor.activeLane === "automation" && automationCcLane;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (
        !containerRef.current?.contains(document.activeElement) &&
        document.activeElement !== document.body
      ) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      if (e.code === "Space") {
        e.preventDefault();
        if (playback.isPaused) {
          handlePlay();
        } else if (playback.isPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (editor.selectedIds.size > 0) {
          e.preventDefault();
          editor.deleteSelected();
        }
      } else if (isCtrl && e.key === "d") {
        e.preventDefault();
        editor.duplicateSelected();
      } else if (isCtrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
      } else if (isCtrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        editor.redo();
      } else if (isCtrl && e.key === "a") {
        e.preventDefault();
        editor.selectAll();
      } else if (e.key === "ArrowUp" && !isCtrl && !e.altKey) {
        if (editor.selectedIds.size > 0) {
          e.preventDefault();
          editor.transposeSelected(e.shiftKey ? 12 : 1);
        }
      } else if (e.key === "ArrowDown" && !isCtrl && !e.altKey) {
        if (editor.selectedIds.size > 0) {
          e.preventDefault();
          editor.transposeSelected(e.shiftKey ? -12 : -1);
        }
      } else if (e.key === "ArrowLeft" && !isCtrl && !e.altKey) {
        if (editor.selectedIds.size > 0) {
          e.preventDefault();
          editor.moveSelectedByStep(0, -editor.gridSizeSeconds);
        }
      } else if (e.key === "ArrowRight" && !isCtrl && !e.altKey) {
        if (editor.selectedIds.size > 0) {
          e.preventDefault();
          editor.moveSelectedByStep(0, editor.gridSizeSeconds);
        }
      } else if (e.key === "1") {
        editor.setTool("select");
      } else if (e.key === "2") {
        editor.setTool("draw");
      } else if (e.key === "3") {
        editor.setTool("erase");
      } else if (e.key === "s" && !isCtrl) {
        editor.setTool("split");
      } else if (e.key === "4" && !isCtrl) {
        editor.setActiveLane("notes");
      } else if (e.key === "5" && !isCtrl) {
        editor.setActiveLane("velocity");
      } else if (e.key === "6" && !isCtrl) {
        editor.setActiveLane("cc");
      } else if (e.key === "7" && !isCtrl) {
        editor.setActiveLane("automation");
      } else if (isCtrl && e.key === "c") {
        e.preventDefault();
        editor.copySelected();
      } else if (isCtrl && e.key === "x") {
        e.preventDefault();
        editor.cutSelected();
      } else if (isCtrl && e.key === "v") {
        e.preventDefault();
        editor.pasteClipboard();
      } else if (isCtrl && e.key === "j") {
        e.preventDefault();
        if (editor.selectedNotes.length >= 2) {
          editor.joinSelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, playback.isPlaying, playback.isPaused, handlePlay, handlePause]);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const handleToggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);
  const shortcuts = showShortcuts ? (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <span>
        <kbd className="rounded bg-muted px-1">Space</kbd> Play / Pause / Stop
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">1</kbd>
        <kbd className="rounded bg-muted px-1">2</kbd>
        <kbd className="rounded bg-muted px-1">3</kbd> Tools
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">S</kbd> Split
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">4</kbd>
        <kbd className="rounded bg-muted px-1">5</kbd>
        <kbd className="rounded bg-muted px-1">6</kbd>
        <kbd className="rounded bg-muted px-1">7</kbd> Lanes
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Del</kbd> Delete
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Ctrl+D</kbd> Duplicate
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">↑↓</kbd> ±1 st
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Shift+↑↓</kbd> ±1 oct
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">←→</kbd> Nudge time
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Alt</kbd> Drag duplicate
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Ctrl+Wheel</kbd> H-Zoom
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Shift+Wheel</kbd> V-Zoom
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Ctrl+Z</kbd> Undo
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Ctrl+C</kbd>
        <kbd className="rounded bg-muted px-1">Ctrl+V</kbd>
        <kbd className="rounded bg-muted px-1">Ctrl+X</kbd> Copy / Paste / Cut
      </span>
      <span>
        <kbd className="rounded bg-muted px-1">Ctrl+J</kbd> Join
      </span>
    </div>
  ) : null;

  return (
    <div
      ref={containerRef}
      className={`midi-editor-root ${className}`}
      tabIndex={-1}
      data-testid="midi-note-editor"
    >
      <MidiEditorShell
        controls={
          <MidiControlBar
            isPlaying={playback.isPlaying}
            isPaused={playback.isPaused}
            currentTime={playback.currentTime}
            duration={duration}
            bpm={editor.bpm}
            loopEnabled={editor.loopRegion.enabled}
            isSupported={playback.isSupported}
            onPlay={handlePlay}
            onPause={handlePause}
            onStop={handleStop}
            onToggleLoop={handleToggleLoop}
            tool={editor.tool}
            snapGrid={editor.snapGrid}
            timeSignature={editor.timeSignature}
            drawVelocity={editor.drawVelocity}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            isModified={editor.isModified}
            hasSelection={editor.selectedIds.size > 0}
            zoomLevel={zoomLevel}
            verticalZoomLevel={verticalZoomLevel}
            metronomeEnabled={playback.metronomeEnabled}
            canSaveToJob={!!jobId}
            isSaving={isSaving}
            midiRecordSupported={webMidi.isSupported}
            midiRecordEnabled={webMidi.isEnabled}
            onToolChange={editor.setTool}
            onSnapGridChange={editor.setSnapGrid}
            onBpmChange={editor.setBpm}
            onTimeSignatureChange={editor.setTimeSignature}
            onDrawVelocityChange={editor.setDrawVelocity}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onExport={handleExport}
            onReset={handleReset}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomLevelChange={handleZoomLevelChange}
            onVerticalZoomLevelChange={handleVerticalZoomLevelChange}
            onToggleMetronome={playback.toggleMetronome}
            onQuantizeSelection={editor.quantizeSelected}
            onDuplicateSelection={editor.duplicateSelected}
            onToggleMidiRecord={() => webMidi.setEnabled(!webMidi.isEnabled)}
            onSaveToJob={() => void handleSaveToJob()}
            showShortcuts={showShortcuts}
            onToggleShortcuts={handleToggleShortcuts}
            onOpenProcessDialog={() => setProcessDialogOpen(true)}
          />
        }
        trackList={
          <MidiTrackList
            tracks={editor.tracks}
            activeTrackId={editor.activeTrackId}
            onSetActiveTrack={editor.setActiveTrack}
            onAddTrack={editor.addEmptyTrack}
            onRemoveTrack={editor.removeTrack}
            onRenameTrack={editor.setTrackName}
            onToggleMute={(trackId) => {
              const track = editor.tracks.find((t) => t.id === trackId);
              if (track) editor.setTrackMute(trackId, !track.muted);
            }}
            onToggleSolo={(trackId) => {
              const track = editor.tracks.find((t) => t.id === trackId);
              if (track) editor.setTrackSolo(trackId, !track.soloed);
            }}
            onSetInstrument={editor.setTrackInstrument}
          />
        }
        pianoRoll={
          <div className="space-y-sm">
            <MarkerStrip
              markers={markers}
              duration={duration}
              pixelsPerSecond={pixelsPerSecond}
              defaultAddTime={defaultMarkerTime}
              markerExportSupported={midiMarkerExportSupported()}
              onAdd={handleAddMarker}
              onRemove={handleRemoveMarker}
              onSeek={handleSeek}
            />
            {markerExportNotice ? (
              <p className="text-[10px] text-muted-foreground" role="status">
                {markerExportNotice}
              </p>
            ) : null}
            {isDrumContent ? (
              <p className="text-[10px] text-amber-300/90" role="note">
                Drum content detected — scale lock is off so hits keep their pitch.
              </p>
            ) : null}
            <MidiEditorCanvas
              notes={editor.notes}
              selectedIds={editor.selectedIds}
              tool={editor.tool}
              snapGrid={editor.snapGrid}
              bpm={editor.bpm}
              timeSignature={editor.timeSignature}
              gridSizeSeconds={editor.gridSizeSeconds}
              drawVelocity={editor.drawVelocity}
              playheadTime={playheadTime}
              zoomLevel={zoomLevel}
              verticalZoomLevel={verticalZoomLevel}
              scaleGuide={scaleGuide}
              onZoomLevelChange={handleZoomLevelChange}
              onVerticalZoomLevelChange={handleVerticalZoomLevelChange}
              timelineScrollRef={timelineScrollRef}
              onTimelineScroll={handleTimelineScroll}
              onSelectNote={editor.selectNote}
              onSelectNotes={editor.selectNotes}
              onDeselectAll={editor.deselectAll}
              onDeleteNote={editor.deleteNote}
              onAddNote={editor.addNote}
              onMoveNotes={editor.moveNotes}
              onDuplicateNotes={editor.duplicateNotes}
              onResizeNote={editor.resizeNote}
              onSplitNote={editor.splitNoteAt}
              onToggleMuteNote={editor.setNoteMuted}
              onSetNoteChannel={editor.setNoteChannel}
              onQuantizeSelection={editor.quantizeSelected}
              onQuantizeNotes={editor.quantizeNotes}
              onHumanizeSelection={() => editor.humanizeSelected()}
              onLegatoSelection={editor.legatoSelected}
              onAuditionNotes={handleAuditionNotes}
              loopRegion={editor.loopRegion}
              onSeek={handleSeek}
              onLoopChange={handleLoopChange}
              e2eMode={e2eMode}
            />
            {/* Lane tabs — persistent toggle for velocity/CC/automation lanes */}
            <div className="midi-lane-tabs" role="tablist" aria-label="Editor lanes">
              {([
                { value: "notes" as const, label: "Notes" },
                { value: "velocity" as const, label: "Velocity" },
                { value: "cc" as const, label: "CC" },
                { value: "automation" as const, label: "Auto" },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={editor.activeLane === value}
                  onClick={() => {
                    editor.setActiveLane(value);
                    setLaneDrawerOpen(value !== "notes");
                  }}
                  className={
                    editor.activeLane === value
                      ? "midi-lane-tab midi-lane-tab--active"
                      : "midi-lane-tab"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {(showVelocityLane || showCcLane || showAutomationLane) && (
              <MidiLaneDrawer
                title={
                  showVelocityLane
                    ? "Velocity lane"
                    : showCcLane
                      ? "MIDI CC lane"
                      : "Automation lane"
                }
                subtitle={
                  showVelocityLane
                    ? "Edit note dynamics with aligned velocity stalks"
                    : showCcLane
                      ? "Controller data aligned to the piano roll"
                      : "Per-track automation aligned to the note grid"
                }
                open={laneDrawerOpen}
                onToggle={() => setLaneDrawerOpen((open) => !open)}
              >
                <div className="flex">
                  <div className="h-full w-11 shrink-0" />
                  <div
                    ref={laneScrollRef}
                    className="min-w-0 flex-1 overflow-x-auto"
                    onScroll={handleLaneScroll}
                  >
                    {showVelocityLane && (
                      <MidiVelocityLane
                        notes={editor.notes}
                        selectedIds={editor.selectedIds}
                        pixelsPerSecond={pixelsPerSecond}
                        totalDuration={totalDuration}
                        timelineWidth={timelineWidth}
                        onSetNoteVelocity={handleSetNoteVelocity}
                        onSetSelectedVelocity={editor.setSelectedVelocity}
                        onBeginEditGesture={editor.beginEditGesture}
                      />
                    )}
                    {showCcLane && activeCcLane && (
                      <MidiCcLane
                        lane={activeCcLane}
                        pixelsPerSecond={pixelsPerSecond}
                        totalDuration={totalDuration}
                        timelineWidth={timelineWidth}
                        onAddPoint={handleAddCcPoint}
                        onUpdatePoint={handleUpdateCcPoint}
                        onRemovePoint={handleRemoveCcPoint}
                        onBeginEditGesture={editor.beginEditGesture}
                      />
                    )}
                    {showAutomationLane &&
                      automationCcLane &&
                      automationMeta && (
                        <MidiAutomationLane
                          lane={automationCcLane}
                          param={editor.activeAutomationParam}
                          pixelsPerSecond={pixelsPerSecond}
                          totalDuration={totalDuration}
                          timelineWidth={timelineWidth}
                          onAddPoint={(time, value) =>
                            editor.addCcPoint(
                              automationMeta.ccNumber,
                              time,
                              value,
                            )
                          }
                          onUpdatePoint={(index, time, value) =>
                            editor.updateCcPoint(
                              automationMeta.ccNumber,
                              index,
                              time,
                              value,
                            )
                          }
                          onRemovePoint={(index) =>
                            editor.removeCcPoint(automationMeta.ccNumber, index)
                          }
                          onBeginEditGesture={editor.beginEditGesture}
                        />
                      )}
                  </div>
                </div>
              </MidiLaneDrawer>
            )}
            {/* Selection info strip — only visible when notes are selected */}
            <div className="midi-selection-strip">
              <MidiEditorSelectionInfo
              selectedNotes={editor.selectedNotes}
              onDelete={editor.deleteSelected}
              onTranspose={editor.transposeSelected}
              onSetVelocity={editor.setSelectedVelocity}
              onHumanize={() => editor.humanizeSelected()}
              onRandomize={() => editor.randomizeSelected()}
              onJoin={() => editor.joinSelected()}
            />
          </div>
          </div>
        }
        inspector={
          <div className="space-y-sm">
            {anyInspectorOpen ? (
              <>
                <MidiInspectorSection
                  title="Render audio"
                  subtitle="Server-side WAV preview"
                  open={inspectorOpen.render}
                  onToggle={() =>
                    setInspectorOpen((prev) => ({ ...prev, render: !prev.render }))
                  }
                >
                  <MidiRenderAudioControl
                    tracks={editor.tracks}
                    bpm={editor.bpm}
                    preferLiveState={editor.isModified}
                    sourceJobId={jobId}
                  />
                </MidiInspectorSection>
                <MidiInspectorSection
                  title="MIDI FX"
                  subtitle={editor.activeTrack.name}
                  open={inspectorOpen.fx}
                  onToggle={() =>
                    setInspectorOpen((prev) => ({ ...prev, fx: !prev.fx }))
                  }
                >
                  <MidiEffectsPanel
                    trackName={editor.activeTrack.name}
                    config={activeMidiFx}
                    applyMode={activeMidiFxApplyMode}
                    previewEnabled={activeMidiFxPreview}
                    applyToAllTrack={fxApplyToAll}
                    onApplyToAllTrackChange={setFxApplyToAll}
                    onChange={handleMidiFxChange}
                    onApplyModeChange={(mode) =>
                      editor.setTrackMidiFxApplyMode(editor.activeTrackId, mode)
                    }
                    onPreviewChange={(enabled) =>
                      editor.setTrackMidiFxPreview(editor.activeTrackId, enabled)
                    }
                    onApplyPreset={handleMidiFxPreset}
                    onApply={handleApplyMidiEffects}
                    targetCount={effectsTargetNotes.length}
                  />
                </MidiInspectorSection>
                <MidiInspectorSection
                  title="Smart chords"
                  subtitle="Diatonic suggestions"
                  open={inspectorOpen.chords}
                  onToggle={() =>
                    setInspectorOpen((prev) => ({ ...prev, chords: !prev.chords }))
                  }
                >
                  <MidiSmartPanel
                    root={scaleGuide.root}
                    scale={scaleGuide.scale}
                    scaleLockDisabled={isDrumContent}
                    onInsertChord={handleInsertChord}
                    onInsertProgression={handleInsertProgression}
                    onScaleChange={setScaleGuide}
                  />
                </MidiInspectorSection>
                <MidiInspectorSection
                  title="Harmony"
                  subtitle="Key & chords"
                  open={inspectorOpen.harmony}
                  onToggle={() =>
                    setInspectorOpen((prev) => ({ ...prev, harmony: !prev.harmony }))
                  }
                >
                  <MidiHarmonyPanel
                    notes={editor.notes}
                    bpm={editor.bpm}
                    timeSignature={editor.timeSignature}
                    autoAnalyze={inspectorOpen.harmony}
                  />
                </MidiInspectorSection>
              </>
            ) : (
              <div className="midi-inspector-tabs">
                <button
                  type="button"
                  className="midi-inspector-tab"
                  onClick={() =>
                    setInspectorOpen((prev) => ({ ...prev, render: true }))
                  }
                  title="Render audio"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </button>
                <button
                  type="button"
                  className="midi-inspector-tab"
                  onClick={() =>
                    setInspectorOpen((prev) => ({ ...prev, fx: true }))
                  }
                  title="MIDI FX"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                </button>
                <button
                  type="button"
                  className="midi-inspector-tab"
                  onClick={() =>
                    setInspectorOpen((prev) => ({ ...prev, chords: true }))
                  }
                  title="Smart chords"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="6" y1="8" x2="6" y2="16"/><line x1="18" y1="8" x2="18" y2="16"/></svg>
                </button>
                <button
                  type="button"
                  className="midi-inspector-tab"
                  onClick={() =>
                    setInspectorOpen((prev) => ({ ...prev, harmony: true }))
                  }
                  title="Harmonic analysis"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                </button>
              </div>
            )}
          </div>
        }
        shortcuts={
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            {shortcuts}
            {saveError && (
              <span className="text-xs text-destructive-300" role="alert">
                {saveError}
              </span>
            )}
          </div>
        }
      />
      <MidiProcessDialog
        open={processDialogOpen}
        onClose={() => setProcessDialogOpen(false)}
        notes={editor.notes}
        bpm={editor.bpm}
        snapGrid={editor.snapGrid}
        timeSignature={editor.timeSignature}
        onApply={handleProcess}
      />
    </div>
  );
}
