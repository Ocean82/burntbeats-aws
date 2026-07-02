/**
 * Rhythm generation API — proxied to midi_service.
 */
import { API_BASE } from "../config";
import { authHeaders } from "./auth";

export interface RhythmStyleInfo {
  id: string;
  label: string;
  description?: string;
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

export async function fetchRhythmStyles(): Promise<RhythmStyleInfo[]> {
  const res = await fetch(`${API_BASE}/api/midi/rhythm/styles`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string" ? body.error : "Failed to load rhythm styles",
    );
  }
  const data = (await res.json()) as { styles?: Record<string, unknown>[] };
  if (!Array.isArray(data.styles)) return [];
  return data.styles.map((style) => normalizeRhythmStyle(style));
}

export interface RhythmGenerateJsonResponse {
  filename: string;
  midi_base64: string;
  metadata?: Record<string, unknown>;
}

export async function generateRhythmJson(body: {
  style?: string;
  bars?: number;
  tempo?: number;
  energy?: number;
}): Promise<RhythmGenerateJsonResponse> {
  const res = await fetch(`${API_BASE}/api/midi/rhythm/generate/json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Rhythm generation failed",
    );
  }
  return res.json();
}
