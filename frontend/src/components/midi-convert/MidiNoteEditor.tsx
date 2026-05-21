/**
 * MidiNoteEditor — main editor component that composes canvas + toolbar + selection info.
 * Handles keyboard shortcuts and coordinates all editor sub-components.
 */
import { useCallback, useEffect, useRef } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { useMidiEditor } from "../../hooks/useMidiEditor";
import { exportNotesToMidi, downloadMidiBlob } from "../../utils/midiExport";
import { MidiEditorToolbar } from "./MidiEditorToolbar";
import { MidiEditorCanvas } from "./MidiEditorCanvas";
import { MidiEditorSelectionInfo } from "./MidiEditorSelectionInfo";

interface MidiNoteEditorProps {
  initialNotes: MidiNoteEvent[];
  bpm: number;
  className?: string;
}

export function MidiNoteEditor({ initialNotes, bpm, className = "" }: MidiNoteEditorProps) {
  const editor = useMidiEditor(initialNotes, bpm);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if our container or its children are focused
      if (!containerRef.current?.contains(document.activeElement) &&
          document.activeElement !== document.body) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      if (e.key === "Delete" || e.key === "Backspace") {
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
  }, [editor]);

  const handleExport = useCallback(() => {
    const blob = exportNotesToMidi(editor.notes, editor.bpm, "Edited");
    downloadMidiBlob(blob, "edited.mid");
  }, [editor.notes, editor.bpm]);

  const handleReset = useCallback(() => {
    editor.resetToOriginal(initialNotes);
  }, [editor, initialNotes]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-3 ${className}`}
      tabIndex={-1}
    >
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

      <MidiEditorCanvas
        notes={editor.notes}
        selectedIds={editor.selectedIds}
        tool={editor.tool}
        snapGrid={editor.snapGrid}
        bpm={editor.bpm}
        gridSizeSeconds={editor.gridSizeSeconds}
        drawVelocity={editor.drawVelocity}
        onSelectNote={editor.selectNote}
        onSelectNotes={editor.selectNotes}
        onDeselectAll={editor.deselectAll}
        onDeleteNote={editor.deleteNote}
        onAddNote={editor.addNote}
        onMoveNotes={editor.moveNotes}
        onResizeNote={editor.resizeNote}
      />

      <MidiEditorSelectionInfo
        selectedNotes={editor.selectedNotes}
        onDelete={editor.deleteSelected}
        onTranspose={editor.transposeSelected}
        onSetVelocity={editor.setSelectedVelocity}
      />

      {/* Keyboard shortcut hints */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/30">
        <span><kbd className="rounded bg-white/10 px-1">1</kbd> Select</span>
        <span><kbd className="rounded bg-white/10 px-1">2</kbd> Draw</span>
        <span><kbd className="rounded bg-white/10 px-1">3</kbd> Erase</span>
        <span><kbd className="rounded bg-white/10 px-1">Del</kbd> Delete</span>
        <span><kbd className="rounded bg-white/10 px-1">↑↓</kbd> Transpose</span>
        <span><kbd className="rounded bg-white/10 px-1">Shift+↑↓</kbd> ±Octave</span>
        <span><kbd className="rounded bg-white/10 px-1">Ctrl+Z</kbd> Undo</span>
        <span><kbd className="rounded bg-white/10 px-1">Ctrl+A</kbd> Select all</span>
      </div>
    </div>
  );
}
