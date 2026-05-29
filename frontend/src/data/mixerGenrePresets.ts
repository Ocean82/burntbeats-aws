/**
 * Genre mixer presets — fetched from API with embedded fallback.
 */
import { API_BASE } from "../config";
import { authHeaders } from "../api/auth";
import { mapGenrePresetStems } from "../utils/mixerGenrePresetMap";
import type { MixerState } from "../types";

export interface GenreMixerPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  mixerState: Record<string, MixerState>;
}

/** Embedded fallback when API is unavailable (mirrors backend/data/mixer-genre-presets.json). */
const EMBEDDED: GenreMixerPreset[] = [
  {
    id: "rock-mix",
    name: "Rock Mix",
    description: "Punchy drums and warm guitars",
    category: "rock",
    mixerState: mapGenrePresetStems({
      drums: {
        gain: 0.85,
        eq: { enabled: true, lowGain: 2, midGain: -1, highGain: 3 },
        compressor: { enabled: true, threshold: -14, ratio: 4, attack: 5, release: 80 },
        reverb: { enabled: true, wetLevel: 0.12 },
      },
      bass: {
        gain: 0.75,
        eq: { enabled: true, lowGain: 3, midGain: 0, highGain: -2 },
        compressor: { enabled: true, threshold: -16, ratio: 3.5, attack: 15, release: 120 },
      },
      guitar: {
        gain: 0.8,
        pan: -0.2,
        eq: { enabled: true, lowGain: -1, midGain: 2, highGain: 2 },
        compressor: { enabled: true, threshold: -18, ratio: 3, attack: 8, release: 100 },
        reverb: { enabled: true, wetLevel: 0.18 },
      },
      vocals: {
        gain: 0.9,
        eq: { enabled: true, lowGain: -2, midGain: 1.5, highGain: 2 },
        compressor: { enabled: true, threshold: -15, ratio: 4, attack: 6, release: 90 },
        reverb: { enabled: true, wetLevel: 0.22 },
      },
    }),
  },
  {
    id: "hiphop-mix",
    name: "Hip Hop Mix",
    description: "Bass-heavy with clear vocals",
    category: "hiphop",
    mixerState: mapGenrePresetStems({
      drums: {
        gain: 0.9,
        eq: { enabled: true, lowGain: 4, midGain: -2, highGain: 4 },
        compressor: { enabled: true, threshold: -12, ratio: 5, attack: 2, release: 60 },
        reverb: { enabled: true, wetLevel: 0.08 },
      },
      bass: {
        gain: 0.85,
        eq: { enabled: true, lowGain: 5, midGain: 1, highGain: -3 },
        compressor: { enabled: true, threshold: -14, ratio: 4.5, attack: 10, release: 150 },
      },
      vocals: {
        gain: 0.95,
        eq: { enabled: true, lowGain: -3, midGain: 2, highGain: 3 },
        compressor: { enabled: true, threshold: -13, ratio: 5, attack: 4, release: 70 },
        reverb: { enabled: true, wetLevel: 0.15 },
      },
    }),
  },
  {
    id: "electronic-mix",
    name: "Electronic Mix",
    description: "Wide stereo and heavy bass",
    category: "electronic",
    mixerState: mapGenrePresetStems({
      drums: {
        gain: 0.8,
        eq: { enabled: true, lowGain: 3, midGain: -1, highGain: 4 },
        compressor: { enabled: true, threshold: -10, ratio: 6, attack: 1, release: 50 },
        reverb: { enabled: true, wetLevel: 0.1 },
      },
      bass: {
        gain: 0.9,
        eq: { enabled: true, lowGain: 4, midGain: 0.5, highGain: -2 },
        compressor: { enabled: true, threshold: -12, ratio: 5, attack: 8, release: 120 },
      },
      melody: {
        gain: 0.75,
        pan: 0.25,
        eq: { enabled: true, lowGain: -2, midGain: 1, highGain: 3 },
        reverb: { enabled: true, wetLevel: 0.2 },
      },
    }),
  },
];

export async function loadGenreMixerPresets(): Promise<GenreMixerPreset[]> {
  try {
    const res = await fetch(`${API_BASE}/api/master/mixer-presets`, {
      headers: await authHeaders(),
    });
    if (!res.ok) return EMBEDDED;
    const data = (await res.json()) as {
      presets: Array<{
        id: string;
        name: string;
        description: string;
        category: string;
        stems: Record<string, unknown>;
      }>;
    };
    if (!Array.isArray(data.presets) || data.presets.length === 0) {
      return EMBEDDED;
    }
    return data.presets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      mixerState: mapGenrePresetStems(
        p.stems as Parameters<typeof mapGenrePresetStems>[0],
      ),
    }));
  } catch {
    return EMBEDDED;
  }
}

export { EMBEDDED as EMBEDDED_GENRE_MIXER_PRESETS };
