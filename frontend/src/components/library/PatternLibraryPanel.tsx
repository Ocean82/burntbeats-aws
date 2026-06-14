/**
 * PatternLibraryPanel — Scrollable panel displaying genre-filtered pattern entries
 * with selection, keyboard navigation, and variation controls.
 *
 * Manages internal genre filter state and computes the displayed pattern list
 * using getValidPresets() and getPresetsByGenre().
 */
import { useMemo, useState, useCallback } from "react";
import { cn } from "../../utils/cn";
import { SectionLabel } from "../ui";
import {
  getValidPresets,
  getPresetsByGenre,
  type GenrePresetPattern,
} from "../../audio/genrePresets";
import type { VariationType } from "../../audio/patternVariations";
import { GenreFilterBar } from "./GenreFilterBar";
import { VariationControlBar } from "./VariationControlBar";

// ─── Constants ────────────────────────────────────────────────────

const MAX_ENTRIES = 50;

const GENRE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "rock", label: "Rock" },
  { value: "hip-hop", label: "Hip-Hop" },
  { value: "edm", label: "EDM" },
  { value: "jazz", label: "Jazz" },
  { value: "latin", label: "Latin" },
  { value: "reggae", label: "Reggae" },
];

// ─── Props ────────────────────────────────────────────────────────

export interface PatternLibraryPanelProps {
  onPatternSelect: (pattern: GenrePresetPattern | null) => void;
  activePatternId: string | null;
  onVariationApply: (type: VariationType) => void;
  activeVariation: VariationType | null;
  disabled?: boolean;
  canUseVariations?: boolean;
  onUpgradeRequest?: () => void;
}

// ─── Component ────────────────────────────────────────────────────

export function PatternLibraryPanel({
  onPatternSelect,
  activePatternId,
  onVariationApply,
  activeVariation,
  disabled = false,
  canUseVariations = true,
  onUpgradeRequest,
}: PatternLibraryPanelProps) {
  const [selectedGenre, setSelectedGenre] = useState<string>("all");

  // Compute filtered pattern list
  const displayedPatterns = useMemo(() => {
    const patterns =
      selectedGenre === "all" ? getValidPresets() : getPresetsByGenre(selectedGenre);
    return patterns.slice(0, MAX_ENTRIES);
  }, [selectedGenre]);

  // Handle pattern entry selection
  const handleSelect = useCallback(
    (pattern: GenrePresetPattern) => {
      if (disabled) return;
      // Toggle: clicking the same pattern deselects it
      if (activePatternId === pattern.id) {
        onPatternSelect(null);
      } else {
        onPatternSelect(pattern);
      }
    },
    [activePatternId, onPatternSelect, disabled],
  );

  // Keyboard handler for entries
  const handleEntryKeyDown = useCallback(
    (e: React.KeyboardEvent, pattern: GenrePresetPattern) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect(pattern);
      }
    },
    [handleSelect],
  );

  const isEmpty = displayedPatterns.length === 0;
  const isFiltered = selectedGenre !== "all";

  return (
    <div
      aria-label="Pattern Library Panel"
      className="flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-3"
    >
      <div>
        <SectionLabel>Overlay layer</SectionLabel>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Plays in sync with your grid. Select a pattern to layer on top during playback.
        </p>
      </div>

      <GenreFilterBar
        genres={GENRE_OPTIONS}
        selected={selectedGenre}
        onSelect={setSelectedGenre}
      />

      {/* Pattern List */}
      <div
        className="max-h-64 overflow-y-auto rounded-md border border-border/50 bg-muted/20"
        role="listbox"
        aria-label="Available rhythm patterns"
      >
        {isEmpty ? (
          <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
            {isFiltered
              ? "No patterns available for the selected genre."
              : "No patterns available."}
          </div>
        ) : (
          displayedPatterns.map((pattern) => {
            const isSelected = activePatternId === pattern.id;
            return (
              <div
                key={pattern.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={disabled ? -1 : 0}
                onClick={() => handleSelect(pattern)}
                onKeyDown={(e) => handleEntryKeyDown(e, pattern)}
                className={cn(
                  "flex flex-col gap-0.5 px-3 py-2 cursor-pointer transition-[background-color,box-shadow] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  isSelected
                    ? "bg-primary-500/10 ring-1 ring-inset ring-primary-400/45"
                    : "hover:bg-muted/60",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {/* Name + Tempo */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {pattern.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {pattern.genre.charAt(0).toUpperCase() + pattern.genre.slice(1)}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {pattern.tempo} BPM
                  </span>
                </div>

                {/* Tags */}
                {pattern.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pattern.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Variation Controls */}
      <VariationControlBar
        onApply={onVariationApply}
        activeVariation={activeVariation}
        disabled={disabled || activePatternId === null}
        canUseVariations={canUseVariations}
        onUpgradeRequest={onUpgradeRequest}
      />
    </div>
  );
}
