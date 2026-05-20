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
  tab: "editor" | "speech" | "midi" | "pricing" | "my-stems";
  /** Short title shown in the badge popover */
  title: string;
  /** Brief description */
  description: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: 3,
    date: "2026-05-15",
    tab: "midi",
    title: "Audio-to-MIDI Conversion",
    description: "Convert any stem or audio file into a downloadable MIDI file. Great for remixing in your DAW.",
  },
  {
    id: 2,
    date: "2026-04-20",
    tab: "speech",
    title: "Speech Clean Tool",
    description: "Denoise and restore voice recordings with AI-powered speech enhancement.",
  },
  {
    id: 1,
    date: "2026-03-01",
    tab: "my-stems",
    title: "My Stems Library",
    description: "Browse and re-download all your previously separated stems from one place.",
  },
];

/** The highest changelog ID — used to determine if user has seen all entries */
export const LATEST_CHANGELOG_ID = CHANGELOG[0]?.id ?? 0;
