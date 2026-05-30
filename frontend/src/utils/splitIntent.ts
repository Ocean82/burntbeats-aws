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

export function intentLabel(intent: SplitIntent): string {
  if (intent.task === "full_separation") {
    return intent.mode === "4" ? "Full separation (4 stems)" : "Full separation (2 stems)";
  }
  if (intent.task === "remove" && intent.targets?.includes("vocals")) {
    return "Remove vocals (karaoke)";
  }
  if (intent.task === "extract" && intent.targets?.length === 1) {
    const t = intent.targets[0];
    return `Extract ${t}`;
  }
  if (intent.task === "extract" && intent.targets?.length) {
    return `Extract ${intent.targets.join(" + ")}`;
  }
  return "Split";
}

export const QUICK_INTENTS: { id: string; label: string; intent: SplitIntent }[] = [
  {
    id: "extract_vocals",
    label: "Extract vocals",
    intent: { task: "extract", targets: ["vocals"] },
  },
  {
    id: "remove_vocals",
    label: "Remove vocals (karaoke)",
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
  {
    id: "extract_guitar",
    label: "Extract guitar",
    intent: { task: "extract", targets: ["guitar"] },
  },
];

export const ADVANCED_TARGETS: SplitTarget[] = [
  "vocals",
  "drums",
  "bass",
  "guitar",
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
