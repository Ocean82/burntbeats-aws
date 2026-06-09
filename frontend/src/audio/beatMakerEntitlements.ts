/**
 * beatMakerEntitlements — Defines what beat maker features are available
 * based on the user's subscription plan.
 *
 * Free (no subscription):
 *   - 3 saved patterns max
 *   - Basic genre presets only (Rock, EDM)
 *   - MIDI export watermarked (limited to 1 bar / 16 steps)
 *   - No cloud sync
 *   - No sharing
 *
 * Basic ($9/mo) or has tokens:
 *   - 10 saved patterns
 *   - All genre presets
 *   - Full MIDI export (no length limit)
 *   - No cloud sync
 *   - No sharing
 *
 * Premium ($15/mo):
 *   - Unlimited saved patterns
 *   - All genre presets + variations
 *   - Full MIDI export
 *   - Cloud sync (future)
 *   - Pattern sharing via link (future)
 *
 * Studio ($25/mo):
 *   - Everything in Premium
 *   - Priority features / beta presets (future)
 */
import type { SubscriptionStatus, ServerPlan } from "../hooks/useSubscription";
import type { Genre } from "./rhythmPatterns";

// ─── Tier Definitions ─────────────────────────────────────────────

export type BeatMakerTier = "free" | "basic" | "premium";

export interface BeatMakerLimits {
  /** Max saved patterns in localStorage (0 = unlimited) */
  maxSavedPatterns: number;
  /** Genres available for preset loading */
  unlockedGenres: Genre[];
  /** Can use variation generators (fill/breakdown/buildup) */
  canUseVariations: boolean;
  /** Can export full-length MIDI (false = limited to 16 steps) */
  canExportFullMidi: boolean;
  /** Can cloud-sync patterns (future) */
  canCloudSync: boolean;
  /** Can share patterns via link (future) */
  canSharePatterns: boolean;
  /** Descriptive tier name for UI */
  tierLabel: string;
}

const FREE_GENRES: Genre[] = ["rock", "edm"];
const ALL_GENRES: Genre[] = ["rock", "hiphop", "edm", "jazz", "latin", "reggae"];

const FREE_LIMITS: BeatMakerLimits = {
  maxSavedPatterns: 3,
  unlockedGenres: FREE_GENRES,
  canUseVariations: false,
  canExportFullMidi: false,
  canCloudSync: false,
  canSharePatterns: false,
  tierLabel: "Free",
};

const BASIC_LIMITS: BeatMakerLimits = {
  maxSavedPatterns: 10,
  unlockedGenres: ALL_GENRES,
  canUseVariations: true,
  canExportFullMidi: true,
  canCloudSync: false,
  canSharePatterns: false,
  tierLabel: "Basic",
};

const PREMIUM_LIMITS: BeatMakerLimits = {
  maxSavedPatterns: 0, // unlimited
  unlockedGenres: ALL_GENRES,
  canUseVariations: true,
  canExportFullMidi: true,
  canCloudSync: true,
  canSharePatterns: true,
  tierLabel: "Premium",
};

// ─── Resolution ───────────────────────────────────────────────────

export function resolveBeatMakerTier(
  status: SubscriptionStatus,
  plan: ServerPlan | null,
): BeatMakerTier {
  if (status !== "active") return "free";
  if (plan === "premium" || plan === "studio") return "premium";
  if (plan === "basic" || plan === "topup" || plan === "single") return "basic";
  return "free";
}

export function getBeatMakerLimits(tier: BeatMakerTier): BeatMakerLimits {
  switch (tier) {
    case "premium":
      return PREMIUM_LIMITS;
    case "basic":
      return BASIC_LIMITS;
    default:
      return FREE_LIMITS;
  }
}

/** Check if a genre is locked for the current tier. */
export function isGenreLocked(genre: Genre, limits: BeatMakerLimits): boolean {
  return !limits.unlockedGenres.includes(genre);
}

/** Check if the user has hit their pattern save limit. */
export function isAtSaveLimit(
  currentCount: number,
  limits: BeatMakerLimits,
): boolean {
  if (limits.maxSavedPatterns === 0) return false; // unlimited
  return currentCount >= limits.maxSavedPatterns;
}
