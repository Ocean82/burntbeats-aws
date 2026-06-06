import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { useMidiEditor } from "../../hooks/useMidiEditor";
import { useMidiPlayback } from "../../hooks/useMidiPlayback";
import { authHeaders } from "../../api/auth";
import { API_BASE } from "../../config";
import { exportTracksToMidi, downloadMidiBlob } from "../../utils/midiExport";
import { useWebMidiInput } from "../../hooks/useWebMidiInput";
import { snapToGrid } from "../../utils/midiEditorSnap";
import { MidiEditorToolbar } from "./MidiEditorToolbar";
import { MidiEditorCanvas } from "./MidiEditorCanvas";
import { MidiEditorSelectionInfo } from "./MidiEditorSelectionInfo";
import { MidiEditorShell } from "./MidiEditorShell";
import { MidiTransportBar } from "./MidiTransportBar";
import { MarkerStrip, createMarker, type SectionMarker } from "./MarkerStrip";
import { MidiSmartPanel } from "./MidiSmartPanel";
import { MidiVelocityLane } from "./MidiVelocityLane";
import { MidiCcLane } from "./MidiCcLane";
import { MidiAutomationLane } from "./MidiAutomationLane";
import { MidiTrackList } from "./MidiTrackList";
import { clampEditorZoom } from "./pianoRollTheme";
import { useMidiTimelineLayout, useTimelineViewportWidth } from "./useMidiTimelineLayout";
import type { LoopRegion } from "./editorTypes";
import { AUTOMATION_PARAMS } from "./editorTypes";

interface MidiNoteEditorProps {
  initialNotes: MidiNoteEvent[];
  bpm: number;
  jobId?: string | null;
  jobToken?: string | null;
  className?: string;
}

export function MidiNoteEditor({
  initialNotes,
  bpm,
  jobId = null,
  jobToken = null,
  className = "",
}: MidiNoteEditorProps) {
  const editor = useMidiEditor(initialNotes, bpm);
  const playback = useMidiPlayback();
  const containerRef = useRef<HTMLDivElement>(null);
  const laneScrollRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const viewportWidth = useTimelineViewportWidth(containerRef);
  const timeline = useMidiTimelineLayout(editor.notes, zoomLevel, viewportWidth);
  const [markers, setMarkers] = useState<SectionMarker[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { minStart, duration } = useMemo(
    () => ({ minStart: timeline.minStart, duration: timeline.duration }),
    [timeline.minStart, timeline.duration],
  );

  const playheadTime = useMemo(() => {
    if (playback.currentTime <= 0 && !playback.isPlaying && !playback.isPaused) {
      return null;
    }
    return minStart + playback.currentTime;
  }, [minStart, playback.isPlaying, playback.isPaused, playback.currentTime]);

  const playbackTracks = useMemo(
    () =>
      editor.tracks.map((t) => ({
        id: t.id,
        notes: t.notes,
        muted: t.muted,
        soloed: t.soloed,
        instrument: t.instrument,
      })),
    [editor.tracks],
  );

  const handlePlay = useCallback(() => {
    const loop = editor.loopRegion.enabled ? editor.loopRegion : undefined;
    playback.play(playbackTracks, { bpm: editor.bpm, loopRegion: loop });
  }, [playback, playbackTracks, editor.bpm, editor.loopRegion]);

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
      const noteId = editorRef.current.beginRecordedNote(pitch, start, velocity);
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

  const handleExport = useCallback(() => {
    const blob = exportTracksToMidi(editor.tracks, editor.bpm);
    downloadMidiBlob(blob, "edited.mid");
  }, [editor.tracks, editor.bpm]);

  const handleSaveToJob = useCallback(async () => {
    if (!jobId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const blob = exportTracksToMidi(editor.tracks, editor.bpm);
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
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [jobId, jobToken, editor.tracks, editor.bpm]);

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

  const handleAddMarker = useCallback((time: number, label: string) => {
    setMarkers((prev) => [...prev, createMarker(time, label)]);
  }, []);

  const handleRemoveMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleInsertChord = useCallback(
    (midiNotes: number[]) => {
      const start = editor.selectedNotes.length
        ? Math.min(...editor.selectedNotes.map((n) => n.start))
        : 0;
      for (const pitch of midiNotes) {
        editor.addNote(pitch, start);
      }
    },
    [editor],
  );

  const handleSetNoteVelocity = useCallback(
    (noteId: string, velocity: number) => {
      editor.setNoteVelocity(noteId, velocity);
    },
    [editor],
  );

  const handleTimelineScroll = useCallback((scrollLeft: number) => {
    if (laneScrollRef.current && laneScrollRef.current.scrollLeft !== scrollLeft) {
      laneScrollRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  const handleLaneScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft;
    if (timeline.scrollRef.current && timeline.scrollRef.current.scrollLeft !== left) {
      timeline.scrollRef.current.scrollLeft = left;
    }
  }, [timeline.scrollRef]);

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
  const showAutomationLane = editor.activeLane === "automation" && automationCcLane;

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
      } else if (e.key === "ArrowUp" && !isCtrl) {
        if (editor.selectedIds.size > 0) {
          e.preventDefault();
          editor.transposeSelected(e.shiftKey ? 12 : 1);
        }
      } else if (e.key === "ArrowDown" && !isCtrl) {
        if (editor.selectedIds.size > 0) {
          e.preventDefault();
          editor.transposeSelected(e.shiftKey ? -12 : -1);
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

  const shortcuts = (
    <>
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
    </>
  );

  return (
    <div ref={containerRef} className={`midi-editor-root ${className}`} tabIndex={-1}>
      <MidiEditorShell
        transport={
          <MidiTransportBar
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
          />
        }
        toolbar={
          <MidiEditorToolbar
            tool={editor.tool}
            snapGrid={editor.snapGrid}
            bpm={editor.bpm}
            timeSignature={editor.timeSignature}
            drawVelocity={editor.drawVelocity}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            isModified={editor.isModified}
            hasSelection={editor.selectedIds.size > 0}
            zoomLevel={zoomLevel}
            metronomeEnabled={playback.metronomeEnabled}
            activeLane={editor.activeLane}
            canSaveToJob={!!jobId}
            isSaving={isSaving}
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
            onToggleMetronome={playback.toggleMetronome}
            onQuantizeSelection={editor.quantizeSelected}
            onDuplicateSelection={editor.duplicateSelected}
            onActiveLaneChange={editor.setActiveLane}
            activeCcNumber={editor.activeCcNumber}
            activeAutomationParam={editor.activeAutomationParam}
            onActiveCcNumberChange={editor.setActiveCcNumber}
            onActiveAutomationParamChange={editor.setActiveAutomationParam}
            midiRecordEnabled={webMidi.isEnabled}
            midiRecordSupported={webMidi.isSupported}
            onToggleMidiRecord={() => webMidi.setEnabled(!webMidi.isEnabled)}
            onSaveToJob={() => void handleSaveToJob()}
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
              pixelsPerSecond={timeline.pixelsPerSecond}
              onAdd={handleAddMarker}
              onRemove={handleRemoveMarker}
            />
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
              onZoomLevelChange={handleZoomLevelChange}
              timelineScrollRef={timeline.scrollRef}
              onTimelineScroll={handleTimelineScroll}
              onSelectNote={editor.selectNote}
              onSelectNotes={editor.selectNotes}
              onDeselectAll={editor.deselectAll}
              onDeleteNote={editor.deleteNote}
              onAddNote={editor.addNote}
              onMoveNotes={editor.moveNotes}
              onResizeNote={editor.resizeNote}
              onSplitNote={editor.splitNoteAt}
              loopRegion={editor.loopRegion}
              onSeek={handleSeek}
              onLoopChange={handleLoopChange}
            />
            {(showVelocityLane || showCcLane || showAutomationLane) && (
              <div className="flex">
                <div className="shrink-0" style={{ width: timeline.leftMargin }} />
                <div
                  ref={laneScrollRef}
                  className="min-w-0 flex-1 overflow-x-auto"
                  onScroll={handleLaneScroll}
                >
                  {showVelocityLane && (
                    <MidiVelocityLane
                      notes={editor.notes}
                      selectedIds={editor.selectedIds}
                      pixelsPerSecond={timeline.pixelsPerSecond}
                      totalDuration={timeline.totalDuration}
                      timelineWidth={timeline.timelineWidth}
                      onSetNoteVelocity={handleSetNoteVelocity}
                      onSetSelectedVelocity={editor.setSelectedVelocity}
                      onBeginEditGesture={editor.beginEditGesture}
                    />
                  )}
                  {showCcLane && activeCcLane && (
                    <MidiCcLane
                      lane={activeCcLane}
                      pixelsPerSecond={timeline.pixelsPerSecond}
                      totalDuration={timeline.totalDuration}
                      timelineWidth={timeline.timelineWidth}
                      onAddPoint={handleAddCcPoint}
                      onUpdatePoint={handleUpdateCcPoint}
                      onRemovePoint={handleRemoveCcPoint}
                      onBeginEditGesture={editor.beginEditGesture}
                    />
                  )}
                  {showAutomationLane && automationCcLane && automationMeta && (
                    <MidiAutomationLane
                      lane={automationCcLane}
                      param={editor.activeAutomationParam}
                      pixelsPerSecond={timeline.pixelsPerSecond}
                      totalDuration={timeline.totalDuration}
                      timelineWidth={timeline.timelineWidth}
                      onAddPoint={(time, value) =>
                        editor.addCcPoint(automationMeta.ccNumber, time, value)
                      }
                      onUpdatePoint={(index, time, value) =>
                        editor.updateCcPoint(automationMeta.ccNumber, index, time, value)
                      }
                      onRemovePoint={(index) =>
                        editor.removeCcPoint(automationMeta.ccNumber, index)
                      }
                      onBeginEditGesture={editor.beginEditGesture}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        }
        inspector={
          <div className="space-y-sm">
            <MidiEditorSelectionInfo
              selectedNotes={editor.selectedNotes}
              onDelete={editor.deleteSelected}
              onTranspose={editor.transposeSelected}
              onSetVelocity={editor.setSelectedVelocity}
              onHumanize={() => editor.humanizeSelected()}
              onRandomize={() => editor.randomizeSelected()}
              onJoin={() => editor.joinSelected()}
            />
            <MidiSmartPanel onInsertChord={handleInsertChord} />
          </div>
        }
        shortcuts={
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {shortcuts}
            {saveError && (
              <span className="text-xs text-destructive-300" role="alert">
                {saveError}
              </span>
            )}
          </div>
        }
      />
    </div>
  );
}
