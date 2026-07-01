/**
 * Fetch available soundfonts for server-side MIDI render.
 */
import { API_BASE } from "../config";
import { authHeaders } from "./auth";

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
  const res = await fetch(`${API_BASE}/api/midi/soundfonts`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Soundfont list failed (${res.status})`);
  }
  return res.json() as Promise<SoundfontListResponse>;
}
