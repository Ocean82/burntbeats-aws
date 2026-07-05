/**
 * Changelog entries for the "What's New" badge system.
 * Add new entries at the top. The `tab` field determines which nav tab shows the badge.
 */

export interface ChangelogEntry {
  /** Unique ID — increment for each new entry */
  id: number;
  /** ISO date string */
  date: string;
  /** Which tab this feature belongs to */
  tab: "editor" | "speech" | "midi" | "pricing" | "my-stems" | "beats";
  /** Short title shown in the badge popover */
  title: string;
  /** Brief description */
  description: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: 4,
    date: "2026-07-01",
    tab: "beats",
    title: "Beat Maker",
    description:
      "Build drum patterns with swing, presets, pattern chains, and MIDI export — right in the Beats tab.",
  },
  {
    id: 3,
    date: "2026-05-15",
    tab: "midi",
    title: "Sound → Notes",
    description: "Turn any recording into editable sheet music or MIDI files. Great for remixing in your DAW.",
  },
  {
    id: 2,
    date: "2026-04-20",
    tab: "speech",
    title: "Clean Up Vocals",
    description: "Denoise and restore voice recordings with AI-powered vocal cleanup.",
  },
  {
    id: 1,
    date: "2026-03-01",
    tab: "my-stems",
    title: "Your Splits Library",
    description: "Browse and re-download all your previously separated tracks from one place.",
  },
];

/** The highest changelog ID — used to determine if user has seen all entries */
export const LATEST_CHANGELOG_ID = CHANGELOG[0]?.id ?? 0;
