/**
 * Fetch available soundfonts for server-side MIDI render.
 */
import { apiGet } from "./client";

export interface SoundfontInfo {
  name: string;
}

export interface SoundfontListResponse {
  default: string;
  default_available: boolean;
  default_error?: string | null;
  soundfonts: SoundfontInfo[];
}

export async function fetchSoundfonts(): Promise<SoundfontListResponse> {
  const result = await apiGet<SoundfontListResponse>("/api/midi/soundfonts");
  if (result.error || !result.data) {
    throw new Error(result.error ?? `Soundfont list failed (${result.status})`);
  }
  return result.data;
}
