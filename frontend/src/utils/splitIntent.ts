import type { SplitIntent, SplitQuality, SplitTarget } from "@shared/types";

export type { SplitIntent };

export const DEFAULT_SPLIT_INTENT: SplitIntent = {
  task: "full_separation",
  mode: "2",
  quality: "high",
};

export function qualityToIntent(quality: SplitQuality): "fast" | "high" {
  return quality === "speed" ? "fast" : "high";
}

export function intentQualityToLegacy(quality: "fast" | "high" | undefined): SplitQuality {
  return quality === "fast" ? "speed" : "quality";
}

export function withIntentQuality(
  intent: SplitIntent,
  quality: SplitQuality,
): SplitIntent {
  return { ...intent, quality: qualityToIntent(quality) };
}

export const SPLIT_VOCAL_LABELS = {
  acapella: "Acapella",
  karaoke: "Karaoke",
} as const;

export const SPLIT_VOCAL_HINTS = {
  acapella: "Lead vocals only — acapella-style",
  karaoke: "Instrumental + backing vocals — karaoke-style",
} as const;

export function intentLabel(intent: SplitIntent): string {
  if (intent.task === "full_separation") {
    return intent.mode === "4" ? "Full separation (4 stems)" : "Full separation (2 stems)";
  }
  if (intent.task === "remove" && intent.targets?.includes("vocals")) {
    return SPLIT_VOCAL_LABELS.karaoke;
  }
  if (intent.task === "extract" && intent.targets?.length === 1) {
    const t = intent.targets[0];
    if (t === "vocals") return SPLIT_VOCAL_LABELS.acapella;
    return `Extract ${t}`;
  }
  if (intent.task === "extract" && intent.targets?.length) {
    return `Extract ${intent.targets.join(" + ")}`;
  }
  return "Split";
}

export const QUICK_INTENTS: {
  id: string;
  label: string;
  /** Plain-language hover hint for unfamiliar terminology */
  hint?: string;
  intent: SplitIntent;
}[] = [
  {
    id: "extract_vocals",
    label: SPLIT_VOCAL_LABELS.acapella,
    hint: SPLIT_VOCAL_HINTS.acapella,
    intent: { task: "extract", targets: ["vocals"] },
  },
  {
    id: "remove_vocals",
    label: SPLIT_VOCAL_LABELS.karaoke,
    hint: SPLIT_VOCAL_HINTS.karaoke,
    intent: { task: "remove", targets: ["vocals"] },
  },
  {
    id: "extract_drums",
    label: "Extract drums",
    intent: { task: "extract", targets: ["drums"] },
  },
  {
    id: "extract_bass",
    label: "Extract bass",
    intent: { task: "extract", targets: ["bass"] },
  },
];

/** Targets shown in advanced picker — omit guitar until UVR-MDX-NET-Guitar.onnx is deployed. */
export const ADVANCED_TARGETS: SplitTarget[] = [
  "vocals",
  "drums",
  "bass",
  "other",
  "instrumental",
];

export function legacyStemsFromIntent(intent: SplitIntent): "2" | "4" {
  if (intent.task === "full_separation") {
    return intent.mode === "4" ? "4" : "2";
  }
  if (intent.task === "remove") return "2";
  const n = intent.targets?.length ?? 1;
  return n >= 4 ? "4" : "2";
}
