/**
 * Demo track metadata — pre-split stems hosted on CDN for instant "Try it" experience.
 * These URLs should point to publicly accessible audio files (WAV or MP3).
 *
 * To set up:
 * 1. Split a short (~30s) royalty-free track into stems
 * 2. Upload stems to your S3/CDN bucket under a /demo/ prefix
 * 3. Update the URLs below
 */

export interface DemoStem {
  id: string;
  label: string;
  url: string;
}

export interface DemoTrack {
  name: string;
  durationSec: number;
  stems: DemoStem[];
}

/**
 * The demo track configuration.
 * Set VITE_DEMO_TRACK_BASE_URL in .env to your CDN prefix, e.g.:
 *   VITE_DEMO_TRACK_BASE_URL=https://cdn.burntbeats.com/demo
 */
const BASE_URL = import.meta.env.VITE_DEMO_TRACK_BASE_URL ?? "/demo";

export const DEMO_TRACK: DemoTrack = {
  name: "Demo — Neon Pulse (30s)",
  durationSec: 30,
  stems: [
    { id: "vocals", label: "Vocals", url: `${BASE_URL}/vocals.wav` },
    { id: "drums", label: "Drums", url: `${BASE_URL}/drums.wav` },
    { id: "bass", label: "Bass", url: `${BASE_URL}/bass.wav` },
    { id: "other", label: "Melody", url: `${BASE_URL}/other.wav` },
  ],
};

/** Whether the demo track feature is enabled (requires CDN assets to be deployed) */
export const DEMO_TRACK_ENABLED =
  typeof import.meta.env.VITE_DEMO_TRACK_BASE_URL === "string" &&
  import.meta.env.VITE_DEMO_TRACK_BASE_URL.length > 0;
