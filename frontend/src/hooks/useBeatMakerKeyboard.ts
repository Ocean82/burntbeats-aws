import { useEffect, useCallback } from "react";
import type { UseBeatMakerReturn } from "./useBeatMaker";
import type { UseBeatMakerGridFocusReturn } from "./useBeatMakerGridFocus";
import { patternToMidiNotes } from "../audio/beatPatternExport";
import { downloadMidiBlob, exportNotesToMidi } from "../utils/midiExport";

export interface UseBeatMakerKeyboardOptions {
  beatMaker: UseBeatMakerReturn;
  gridFocus: UseBeatMakerGridFocusReturn;
  canExportFullMidi?: boolean;
  onExportGated?: () => void;
  onExportMidi?: () => void;
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useBeatMakerKeyboard({
  beatMaker,
  gridFocus,
  canExportFullMidi = true,
  onExportGated,
  onExportMidi,
  enabled = true,
}: UseBeatMakerKeyboardOptions): void {
  const exportMidi = useCallback(() => {
    if (onExportMidi) {
      onExportMidi();
      return;
    }
    if (!canExportFullMidi && beatMaker.steps > 16) {
      onExportGated?.();
      return;
    }
    const notes = patternToMidiNotes({
      pattern: beatMaker.pattern,
      rowStates: beatMaker.rowStates,
      kit: beatMaker.kit,
      bpm: beatMaker.bpm,
      swing: beatMaker.swing,
      steps: beatMaker.steps,
      canExportFullMidi,
    });
    const blob = exportNotesToMidi(notes, beatMaker.bpm, "Drum Pattern");
    downloadMidiBlob(blob, "drum-pattern.mid");
  }, [beatMaker, canExportFullMidi, onExportGated, onExportMidi]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (beatMaker.playing) beatMaker.stop();
        else beatMaker.start();
        return;
      }

      if (event.key >= "1" && event.key <= "8") {
        const row = Number(event.key) - 1;
        if (row < beatMaker.kit.length) {
          event.preventDefault();
          beatMaker.toggleMute(row);
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        exportMidi();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        beatMaker.toggleCell(gridFocus.focus.row, gridFocus.focus.step);
        return;
      }

      let deltaRow = 0;
      let deltaStep = 0;
      if (event.key === "ArrowUp") deltaRow = -1;
      if (event.key === "ArrowDown") deltaRow = 1;
      if (event.key === "ArrowLeft") deltaStep = -1;
      if (event.key === "ArrowRight") deltaStep = 1;

      if (deltaRow !== 0 || deltaStep !== 0) {
        event.preventDefault();
        gridFocus.moveFocus(
          deltaRow,
          deltaStep,
          beatMaker.kit.length,
          beatMaker.steps,
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, beatMaker, gridFocus, exportMidi]);
}
