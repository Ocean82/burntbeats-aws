/**
 * Built-in rhythm style catalog when /api/midi/rhythm is unavailable.
 * IDs align with midi_service AVAILABLE_STYLES for seamless fallback.
 */
import type { RhythmStyleInfo } from "../api/midiRhythm";

export const OFFLINE_RHYTHM_STYLES: RhythmStyleInfo[] = [
  {
    id: "rock",
    label: "Rock",
    description: "Steady 4/4 with strong backbeat (offline)",
  },
  {
    id: "hiphop",
    label: "Hip-Hop",
    description: "Boom bap with off-beat hats (offline)",
  },
  {
    id: "edm",
    label: "EDM/House",
    description: "Four-on-the-floor with off-beat hats (offline)",
  },
  {
    id: "techno",
    label: "Techno",
    description: "Driving four-on-the-floor (offline)",
  },
  {
    id: "trap",
    label: "Trap",
    description: "Sparse kicks with hat accents (offline)",
  },
  {
    id: "dnb",
    label: "Drum & Bass",
    description: "Broken beat with fast hats (offline)",
  },
  {
    id: "jazz",
    label: "Jazz",
    description: "Ride pattern with brush comping (offline)",
  },
  {
    id: "latin",
    label: "Latin",
    description: "Tumbao kick with cowbell (offline)",
  },
  {
    id: "reggae",
    label: "Reggae",
    description: "One-drop with off-beat skank (offline)",
  },
];
