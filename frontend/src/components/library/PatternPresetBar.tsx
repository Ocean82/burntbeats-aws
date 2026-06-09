/**
 * PatternPresetBar — Genre selector, pattern presets, variations, and save/load.
 *
 * Sits above the sequencer grid and drives state via the shared useBeatMaker hook.
 */
import { Bookmark, ChevronDown, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { cn } from "../../utils/cn";
import { SegmentedControl } from "../ui";
import type { UseBeatMakerReturn } from "../../hooks/useBeatMaker";
import type { UsePatternStorageReturn, SavedPattern } from "../../hooks/usePatternStorage";
import {
  GENRES,
  getPresetsByGenre,
  type Genre,
  type PresetEntry,
} from "../../audio/rhythmPatterns";
import { applyVariation, type VariationType } from "../../audio/patternVariations";

// ─── Props ────────────────────────────────────────────────────────

export interface PatternPresetBarProps {
  beatMaker: UseBeatMakerReturn;
  storage: UsePatternStorageReturn;
}

// ─── Component ────────────────────────────────────────────────────

export function PatternPresetBar({ beatMaker, storage }: PatternPresetBarProps) {
  const [selectedGenre, setSelectedGenre] = useState<Genre>("rock");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const genrePresets = useMemo(
    () => getPresetsByGenre(selectedGenre),
    [selectedGenre],
  );

  // ─── Load Preset ──────────────────────────────────────────────

  const handleLoadPreset = useCallback(
    (entry: PresetEntry) => {
      beatMaker.loadPreset(entry.preset);
      setActivePresetId(entry.id);
    },
    [beatMaker],
  );

  // ─── Variations ───────────────────────────────────────────────

  const handleVariation = useCallback(
    (type: VariationType) => {
      const newPattern = applyVariation(beatMaker.pattern, type);
      beatMaker.setPattern(newPattern);
      setActivePresetId(null); // Mark as modified
    },
    [beatMaker],
  );

  // ─── Save ─────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    storage.savePattern(saveName.trim(), {
      name: saveName.trim(),
      pattern: beatMaker.pattern,
      bpm: beatMaker.bpm,
      swing: beatMaker.swing,
      steps: beatMaker.steps,
    });
    setSaveName("");
    setShowSaveInput(false);
  }, [saveName, storage, beatMaker]);

  // ─── Load Saved ───────────────────────────────────────────────

  const handleLoadSaved = useCallback(
    (saved: SavedPattern) => {
      beatMaker.loadPreset(saved.preset);
      setActivePresetId(null);
      setShowSaved(false);
    },
    [beatMaker],
  );

  // ─── Genre options for SegmentedControl ───────────────────────

  const genreOptions = useMemo(
    () => GENRES.map((g) => ({ value: g.value, label: g.label })),
    [],
  );

  return (
    <div className="space-y-sm">
      {/* Genre selector */}
      <div className="flex flex-wrap items-center gap-sm">
        <SegmentedControl
          value={selectedGenre}
          onChange={(val) => {
            setSelectedGenre(val);
            setActivePresetId(null);
          }}
          options={genreOptions}
          aria-label="Select genre"
          className="text-xs"
        />

        {/* Variation buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[9px] text-muted-foreground mr-1">Variations:</span>
          {(["fill", "breakdown", "buildup"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleVariation(type)}
              className="midi-btn text-[10px] px-2 py-1"
              title={`Apply ${type} variation`}
            >
              <Sparkles className="h-3 w-3 mr-0.5 inline" />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Preset cards for selected genre */}
      <div className="flex flex-wrap items-center gap-1">
        {genrePresets.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => handleLoadPreset(entry)}
            className={cn(
              "rounded-md border px-sm py-1 text-xs font-medium transition",
              activePresetId === entry.id
                ? "border-accent-midi-400/60 bg-accent-midi/15 text-accent-midi-200"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {entry.preset.name}
            <span className="ml-1 text-[9px] opacity-60">
              {entry.preset.bpm}bpm
            </span>
          </button>
        ))}

        {/* Saved patterns toggle */}
        <button
          type="button"
          onClick={() => setShowSaved(!showSaved)}
          className={cn(
            "rounded-md border px-sm py-1 text-xs font-medium transition flex items-center gap-0.5",
            showSaved
              ? "border-primary-400/60 bg-primary-500/15 text-primary-200"
              : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Bookmark className="h-3 w-3" />
          My Patterns
          {storage.savedPatterns.length > 0 && (
            <span className="ml-1 text-[9px] opacity-60">
              ({storage.savedPatterns.length})
            </span>
          )}
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", showSaved && "rotate-180")}
          />
        </button>

        {/* Save current */}
        {!showSaveInput ? (
          <button
            type="button"
            onClick={() => setShowSaveInput(true)}
            className="rounded-md border border-border bg-muted/50 px-sm py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            + Save
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Pattern name..."
              className="w-28 rounded border border-border bg-muted px-xs py-0.5 text-xs text-foreground placeholder:text-muted-foreground"
              autoFocus
              onBlur={() => {
                if (!saveName.trim()) setShowSaveInput(false);
              }}
            />
            <button
              type="submit"
              disabled={!saveName.trim()}
              className="midi-btn text-[10px] px-2 py-0.5 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSaveInput(false);
                setSaveName("");
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </form>
        )}
      </div>

      {/* Saved patterns dropdown */}
      {showSaved && storage.savedPatterns.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-sm space-y-1 max-h-40 overflow-y-auto">
          {storage.savedPatterns.map((saved) => (
            <div
              key={saved.id}
              className="flex items-center gap-sm rounded px-sm py-1 hover:bg-muted/60 transition group"
            >
              <button
                type="button"
                onClick={() => handleLoadSaved(saved)}
                className="flex-1 text-left text-xs text-foreground"
              >
                {saved.name}
                <span className="ml-2 text-[9px] text-muted-foreground">
                  {saved.preset.bpm}bpm · {saved.preset.steps} steps
                </span>
              </button>
              <button
                type="button"
                onClick={() => storage.deletePattern(saved.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-error transition"
                aria-label={`Delete ${saved.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSaved && storage.savedPatterns.length === 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-sm text-center text-xs text-muted-foreground">
          No saved patterns yet. Use "+ Save" to save your current pattern.
        </div>
      )}
    </div>
  );
}
