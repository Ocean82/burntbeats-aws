const HANDOFF_KEY = "burntbeats:beat-midi-handoff:v1";

import type { MidiNoteEvent } from "../hooks/useMidiConvert";

export interface BeatMidiHandoff {
  notes: MidiNoteEvent[];
  bpm: number;
  name: string;
}

export function saveBeatHandoff(payload: BeatMidiHandoff): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / quota — ignore.
  }
}

export function readBeatHandoff(): BeatMidiHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BeatMidiHandoff;
    if (!Array.isArray(parsed.notes) || typeof parsed.bpm !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBeatHandoff(): void {
  try {
    sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    // ignore
  }
}

export function hasBeatHandoffQuery(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("beat-handoff") === "1";
}
