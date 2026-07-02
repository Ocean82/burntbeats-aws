import { useCallback, useState } from "react";
import {
  clampEditorVerticalZoom,
  clampEditorZoom,
} from "../components/midi-convert/pianoRollTheme";

export interface MidiViewState {
  horizontalZoom: number;
  verticalZoom: number;
  scrollLeft: number;
}

export const DEFAULT_MIDI_VIEW_STATE: MidiViewState = {
  horizontalZoom: 1,
  verticalZoom: 1,
  scrollLeft: 0,
};

export interface UseMidiViewStateReturn extends MidiViewState {
  setHorizontalZoom: (zoom: number) => void;
  setVerticalZoom: (zoom: number) => void;
  setScrollLeft: (scrollLeft: number) => void;
  resetViewState: () => void;
}

export function useMidiViewState(
  initial: Partial<MidiViewState> = {},
): UseMidiViewStateReturn {
  const [horizontalZoom, setHorizontalZoomRaw] = useState(
    initial.horizontalZoom ?? DEFAULT_MIDI_VIEW_STATE.horizontalZoom,
  );
  const [verticalZoom, setVerticalZoomRaw] = useState(
    initial.verticalZoom ?? DEFAULT_MIDI_VIEW_STATE.verticalZoom,
  );
  const [scrollLeft, setScrollLeft] = useState(
    initial.scrollLeft ?? DEFAULT_MIDI_VIEW_STATE.scrollLeft,
  );

  const setHorizontalZoom = useCallback((zoom: number) => {
    setHorizontalZoomRaw(clampEditorZoom(zoom));
  }, []);

  const setVerticalZoom = useCallback((zoom: number) => {
    setVerticalZoomRaw(clampEditorVerticalZoom(zoom));
  }, []);

  const resetViewState = useCallback(() => {
    setHorizontalZoomRaw(DEFAULT_MIDI_VIEW_STATE.horizontalZoom);
    setVerticalZoomRaw(DEFAULT_MIDI_VIEW_STATE.verticalZoom);
    setScrollLeft(DEFAULT_MIDI_VIEW_STATE.scrollLeft);
  }, []);

  return {
    horizontalZoom,
    verticalZoom,
    scrollLeft,
    setHorizontalZoom,
    setVerticalZoom,
    setScrollLeft,
    resetViewState,
  };
}
