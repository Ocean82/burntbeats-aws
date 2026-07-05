/**
 * Rhythm generation API — proxied to midi_service with offline fallback.
 */
import type { EditableNote } from "../components/midi-convert/editorTypes";
import { OFFLINE_RHYTHM_STYLES } from "../data/offlineRhythmStyles";
import { generateOfflineGrooveNotes } from "../utils/offlineRhythmGroove";
import { rhythmMidiBase64ToEditableNotes } from "../utils/rhythmGrooveNotes";
import { apiGet, apiPost } from "./client";

export interface RhythmStyleInfo {
  id: string;
  label: string;
  description?: string;
}

export type RhythmStylesSource = "online" | "cached" | "offline";

export interface RhythmStylesResult {
  styles: RhythmStyleInfo[];
  source: RhythmStylesSource;
}

export type RhythmGrooveSource = "online" | "offline";

export interface RhythmGrooveResult {
  notes: EditableNote[];
  filename: string;
  source: RhythmGrooveSource;
}

const STYLES_CACHE_KEY = "burntbeats:midi-rhythm-styles:v1";
const GROOVE_MIDI_CACHE_KEY = "burntbeats:midi-rhythm-last-midi:v1";

function readCachedGrooveMidi(): string | null {
  try {
    return sessionStorage.getItem(GROOVE_MIDI_CACHE_KEY);
  } catch {
    return null;
  }
}

function writeCachedGrooveMidi(midiBase64: string): void {
  try {
    sessionStorage.setItem(GROOVE_MIDI_CACHE_KEY, midiBase64);
  } catch {
    // Quota or private mode — ignore.
  }
}

function normalizeRhythmStyle(raw: Record<string, unknown>): RhythmStyleInfo {
  const name = typeof raw.name === "string" ? raw.name : "";
  const id = typeof raw.id === "string" ? raw.id : name;
  return {
    id: id || "unknown",
    label:
      typeof raw.label === "string"
        ? raw.label
        : typeof raw.name === "string"
          ? raw.name
          : id,
    description: typeof raw.description === "string" ? raw.description : undefined,
  };
}

function readCachedStyles(): RhythmStyleInfo[] {
  try {
    const raw = sessionStorage.getItem(STYLES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RhythmStyleInfo[];
    return Array.isArray(parsed) ? parsed.filter((s) => s?.id) : [];
  } catch {
    return [];
  }
}

function writeCachedStyles(styles: RhythmStyleInfo[]): void {
  try {
    sessionStorage.setItem(STYLES_CACHE_KEY, JSON.stringify(styles));
  } catch {
    // Quota or private mode — ignore.
  }
}

export async function fetchRhythmStyles(): Promise<RhythmStyleInfo[]> {
  const result = await apiGet<{ styles?: Record<string, unknown>[] }>(
    "/api/midi/rhythm/styles",
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to load rhythm styles");
  }
  if (!Array.isArray(result.data.styles)) return [];
  return result.data.styles.map((style) => normalizeRhythmStyle(style));
}

export async function fetchRhythmStylesResilient(): Promise<RhythmStylesResult> {
  try {
    const styles = await fetchRhythmStyles();
    if (styles.length) {
      writeCachedStyles(styles);
      return { styles, source: "online" };
    }
  } catch {
    // Fall through to cache / offline catalog.
  }

  const cached = readCachedStyles();
  if (cached.length) {
    return { styles: cached, source: "cached" };
  }

  return { styles: OFFLINE_RHYTHM_STYLES, source: "offline" };
}

export interface RhythmGenerateJsonResponse {
  filename: string;
  midi_base64: string;
  metadata?: Record<string, unknown>;
}

export async function generateRhythmEraJson(body: {
  style?: string;
  bars?: number;
  tempo?: number;
  energy?: number;
  era?: string;
}): Promise<RhythmGenerateJsonResponse> {
  const result = await apiPost<RhythmGenerateJsonResponse>(
    "/api/midi/rhythm/era/generate/json",
    body,
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Era rhythm generation failed");
  }
  return result.data;
}

export async function generateRhythmFull(body: {
  style?: string;
  bars?: number;
  tempo?: number;
  energy?: number;
}): Promise<RhythmGenerateJsonResponse> {
  const result = await apiPost<RhythmGenerateJsonResponse>(
    "/api/midi/rhythm/generate/full",
    body,
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Full rhythm generation failed");
  }
  return result.data;
}

export async function generateRhythmJson(body: {
  style?: string;
  bars?: number;
  tempo?: number;
  energy?: number;
}): Promise<RhythmGenerateJsonResponse> {
  const result = await apiPost<RhythmGenerateJsonResponse>(
    "/api/midi/rhythm/generate/json",
    body,
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Rhythm generation failed");
  }
  return result.data;
}

export async function generateRhythmGroove(body: {
  style: string;
  bars: number;
  tempo: number;
  energy: number;
}): Promise<RhythmGrooveResult> {
  try {
    const response = await generateRhythmJson(body);
    writeCachedGrooveMidi(response.midi_base64);
    const notes = rhythmMidiBase64ToEditableNotes(response.midi_base64);
    if (!notes.length) throw new Error("Generated groove has no notes");
    return {
      notes,
      filename: response.filename,
      source: "online",
    };
  } catch {
    const cachedMidi = readCachedGrooveMidi();
    if (cachedMidi) {
      try {
        const notes = rhythmMidiBase64ToEditableNotes(cachedMidi);
        if (notes.length) {
          return {
            notes,
            filename: `cached_${body.style}_${Math.round(body.tempo)}bpm_${body.bars}bars.mid`,
            source: "online",
          };
        }
      } catch {
        // Fall through to offline generator.
      }
    }
    const notes = generateOfflineGrooveNotes(body);
    if (!notes.length) throw new Error("Offline groove generation failed");
    return {
      notes,
      filename: `offline_${body.style}_${Math.round(body.tempo)}bpm_${body.bars}bars.mid`,
      source: "offline",
    };
  }
}
