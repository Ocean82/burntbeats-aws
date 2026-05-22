/**
 * MidiNoteEditor — DAW-familiar MIDI clip editor (transport + piano roll + inspector).
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { useMidiEditor } from "../../hooks/useMidiEditor";
import { useMidiPlayback } from "../../hooks/useMidiPlayback";
import { exportNotesToMidi, downloadMidiBlob } from "../../utils/midiExport";
import { MidiEditorToolbar } from "./MidiEditorToolbar";
import { MidiEditorCanvas } from "./MidiEditorCanvas";
import { MidiEditorSelectionInfo } from "./MidiEditorSelectionInfo";
import { MidiEditorShell } from "./MidiEditorShell";
import { MidiTransportBar } from "./MidiTransportBar";

interface MidiNoteEditorProps {
  initialNotes: MidiNoteEvent[];
  bpm: number;
  className?: string;
}

export function MidiNoteEditor({ initialNotes, bpm, className = "" }: MidiNoteEditorProps) {
  const editor = useMidiEditor(initialNotes, bpm);
  const playback = useMidiPlayback();
  const containerRef = useRef<HTMLDivElement>(null);

  const { minStart, duration } = useMemo(() => {
    if (!editor.notes.length) {
      return { minStart: 0, duration: 4 };
    }
    const starts = editor.notes.map((n) => n.start);
    const ends = editor.notes.map((n) => n.start + n.duration);
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    return { minStart: min, duration: Math.max(max - min, 0.25) };
  }, [editor.notes]);

  const playheadTime = useMemo(() => {
    if (!playback.isPlaying && playback.currentTime === 0) return null;
    return minStart + playback.currentTime;
  }, [minStart, playback.isPlaying, playback.currentTime]);

  const handlePlay = useCallback(() => {
    playback.play(editor.notes);
  }, [playback, editor.notes]);

  const handleStop = useCallback(() => {
    playback.stop();
  }, [playback]);

  const handleExport = useCallback(() => {
    const blob = exportNotesToMidi(editor.notes, editor.bpm, "Edited");
    downloadMidiBlob(blob, "edited.mid");
  }, [editor.notes, editor.bpm]);

  const handleReset = useCallback(() => {
    playback.stop();
    editor.resetToOriginal(initialNotes);
  }, [editor, initialNotes, playback]);

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
        if (playback.isPlaying) {
          handleStop();
        } else {
          handlePlay();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (editor.selectedIds.size > 0) {
          e.preventDefault();
          editor.deleteSelected();
        }
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, playback.isPlaying, handlePlay, handleStop]);

  const shortcuts = (
    <>
      <span>
        <kbd className="rounded bg-white/10 px-1">Space</kbd> Play / Stop
      </span>
      <span>
        <kbd className="rounded bg-white/10 px-1">1</kbd>
        <kbd className="rounded bg-white/10 px-1">2</kbd>
        <kbd className="rounded bg-white/10 px-1">3</kbd> Tools
      </span>
      <span>
        <kbd className="rounded bg-white/10 px-1">Del</kbd> Delete
      </span>
      <span>
        <kbd className="rounded bg-white/10 px-1">↑↓</kbd> ±1 st
      </span>
      <span>
        <kbd className="rounded bg-white/10 px-1">Shift+↑↓</kbd> ±1 oct
      </span>
      <span>
        <kbd className="rounded bg-white/10 px-1">Ctrl+Z</kbd> Undo
      </span>
    </>
  );

  return (
    <div ref={containerRef} className={className} tabIndex={-1}>
      <MidiEditorShell
        transport={
          <MidiTransportBar
            isPlaying={playback.isPlaying}
            currentTime={playback.currentTime}
            duration={duration}
            bpm={editor.bpm}
            isSupported={playback.isSupported}
            onPlay={handlePlay}
            onStop={handleStop}
          />
        }
        toolbar={
          <MidiEditorToolbar
            tool={editor.tool}
            snapGrid={editor.snapGrid}
            bpm={editor.bpm}
            drawVelocity={editor.drawVelocity}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            isModified={editor.isModified}
            onToolChange={editor.setTool}
            onSnapGridChange={editor.setSnapGrid}
            onBpmChange={editor.setBpm}
            onDrawVelocityChange={editor.setDrawVelocity}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onExport={handleExport}
            onReset={handleReset}
          />
        }
        pianoRoll={
          <MidiEditorCanvas
            notes={editor.notes}
            selectedIds={editor.selectedIds}
            tool={editor.tool}
            snapGrid={editor.snapGrid}
            bpm={editor.bpm}
            gridSizeSeconds={editor.gridSizeSeconds}
            drawVelocity={editor.drawVelocity}
            playheadTime={playheadTime}
            onSelectNote={editor.selectNote}
            onSelectNotes={editor.selectNotes}
            onDeselectAll={editor.deselectAll}
            onDeleteNote={editor.deleteNote}
            onAddNote={editor.addNote}
            onMoveNotes={editor.moveNotes}
            onResizeNote={editor.resizeNote}
          />
        }
        inspector={
          <MidiEditorSelectionInfo
            selectedNotes={editor.selectedNotes}
            onDelete={editor.deleteSelected}
            onTranspose={editor.transposeSelected}
            onSetVelocity={editor.setSelectedVelocity}
          />
        }
        shortcuts={
          <div className="flex flex-wrap gap-x-4 gap-y-1">{shortcuts}</div>
        }
      />
    </div>
  );
}
