/**
 * PatternPresetBar — Grid pattern presets, variations, and save/load.
 * Integrates entitlements to gate features behind subscription tiers.
 */
import { Bookmark, ChevronDown, Lock, Sparkles, Trash2, Zap } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { cn } from "../../utils/cn";
import { SectionLabel, SegmentedControl } from "../ui";
import type { UseBeatMakerReturn } from "../../hooks/useBeatMaker";
import type { UsePatternStorageReturn, SavedPattern } from "../../hooks/usePatternStorage";
import type { UseBeatMakerEntitlementsReturn } from "../../hooks/useBeatMakerEntitlements";
import {
  GENRES,
  getPresetsByGenre,
  type GenreType,
  type GenrePresetPattern,
} from "../../audio/genrePresets";
import { genrePresetToBeatPreset } from "../../audio/beatPresetAdapters";
import { applyVariation, type VariationType } from "../../audio/patternVariations";
import { isGenreLocked, isAtSaveLimit } from "../../audio/beatMakerEntitlements";

export interface PatternPresetBarProps {
  beatMaker: UseBeatMakerReturn;
  storage: UsePatternStorageReturn;
  entitlements: UseBeatMakerEntitlementsReturn;
}

export function PatternPresetBar({ beatMaker, storage, entitlements }: PatternPresetBarProps) {
  const { limits, startCheckout } = entitlements;

  const [selectedGenre, setSelectedGenre] = useState<GenreType>("rock");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [showUpgradeHint, setShowUpgradeHint] = useState<string | null>(null);

  const genrePresets = useMemo(
    () => getPresetsByGenre(selectedGenre),
    [selectedGenre],
  );

  const genreLocked = useMemo(
    () => isGenreLocked(selectedGenre, limits),
    [selectedGenre, limits],
  );

  const atSaveLimit = useMemo(
    () => isAtSaveLimit(storage.savedPatterns.length, limits),
    [storage.savedPatterns.length, limits],
  );

  const handleLoadPreset = useCallback(
    (preset: GenrePresetPattern) => {
      if (genreLocked) {
        setShowUpgradeHint("preset");
        return;
      }
      beatMaker.loadPreset(genrePresetToBeatPreset(preset));
      setActivePresetId(preset.id);
      setShowUpgradeHint(null);
    },
    [beatMaker, genreLocked],
  );

  const handleVariation = useCallback(
    (type: VariationType) => {
      if (!limits.canUseVariations) {
        setShowUpgradeHint("variation");
        return;
      }
      const newPattern = applyVariation(beatMaker.pattern, type);
      beatMaker.setPattern(newPattern);
      setActivePresetId(null);
      setShowUpgradeHint(null);
    },
    [beatMaker, limits.canUseVariations],
  );

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    if (atSaveLimit) {
      setShowUpgradeHint("save");
      return;
    }
    storage.savePattern(saveName.trim(), {
      name: saveName.trim(),
      pattern: beatMaker.pattern,
      bpm: beatMaker.bpm,
      swing: beatMaker.swing,
      steps: beatMaker.steps,
    });
    setSaveName("");
    setShowSaveInput(false);
    setShowUpgradeHint(null);
  }, [saveName, storage, beatMaker, atSaveLimit]);

  const handleLoadSaved = useCallback(
    (saved: SavedPattern) => {
      beatMaker.loadPreset(saved.preset);
      setActivePresetId(null);
      setShowSaved(false);
    },
    [beatMaker],
  );

  const handleUpgrade = useCallback(() => {
    void startCheckout("basic", { source: "upgrade_prompt", intent: "unlock_beat_maker_features" });
  }, [startCheckout]);

  const genreOptions = useMemo(
    () =>
      GENRES.map((g) => ({
        value: g.value,
        label: isGenreLocked(g.value, limits)
          ? `${g.label} (locked)`
          : g.label,
      })),
    [limits],
  );

  return (
    <div className="space-y-sm">
      <div>
        <SectionLabel>Grid pattern</SectionLabel>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Edits your sequencer. Load presets or save your own patterns here.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        <SegmentedControl
          value={selectedGenre}
          onChange={(val) => {
            setSelectedGenre(val as GenreType);
            setActivePresetId(null);
            setShowUpgradeHint(null);
          }}
          options={genreOptions}
          aria-label="Select genre for grid presets"
          className="text-xs"
        />

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[9px] text-muted-foreground mr-1">Grid variations:</span>
          {(["fill", "breakdown", "buildup"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleVariation(type)}
              className={cn(
                "midi-btn text-[10px] px-2 py-1",
                !limits.canUseVariations && "opacity-50",
              )}
              title={
                limits.canUseVariations
                  ? `Apply ${type} to grid pattern`
                  : `Upgrade to unlock grid ${type} variations`
              }
            >
              {limits.canUseVariations ? (
                <Sparkles className="h-3 w-3 mr-0.5 inline" />
              ) : (
                <Lock className="h-3 w-3 mr-0.5 inline" />
              )}
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {genreLocked ? (
          <div className="flex items-center gap-sm rounded-md border border-warning/30 bg-warning/5 px-sm py-1.5 text-xs text-warning">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>
              {selectedGenre.charAt(0).toUpperCase() + selectedGenre.slice(1)} presets require a subscription.
            </span>
            <button
              type="button"
              onClick={handleUpgrade}
              className="ml-2 rounded bg-primary-500 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary-600 transition"
            >
              <Zap className="h-3 w-3 mr-0.5 inline" />
              Upgrade
            </button>
          </div>
        ) : (
          genrePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleLoadPreset(preset)}
              className={cn(
                "rounded-md border px-sm py-1 text-xs font-medium transition",
                activePresetId === preset.id
                  ? "border-accent-midi-400/60 bg-accent-midi/15 text-accent-midi-200"
                  : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {preset.name}
              <span className="ml-1 text-[9px] opacity-60">
                {preset.tempo}bpm
              </span>
            </button>
          ))
        )}

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
          {limits.canCloudSync && (
            <span
              className={cn(
                "ml-1 rounded px-1 text-[8px] uppercase tracking-wide",
                storage.syncStatus === "synced" && "bg-success/15 text-success",
                storage.syncStatus === "syncing" && "bg-warning/15 text-warning",
                storage.syncStatus === "error" && "bg-error/15 text-error",
                storage.syncStatus === "local" && "bg-muted text-muted-foreground",
              )}
              title={storage.lastSyncError ?? "Cloud sync status"}
              data-testid="beat-pattern-sync-status"
            >
              {storage.syncStatus}
            </span>
          )}
          {storage.savedPatterns.length > 0 && (
            <span className="ml-1 text-[9px] opacity-60">
              ({storage.savedPatterns.length}
              {limits.maxSavedPatterns > 0 && `/${limits.maxSavedPatterns}`})
            </span>
          )}
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", showSaved && "rotate-180")}
          />
        </button>

        {!showSaveInput ? (
          <button
            type="button"
            onClick={() => {
              if (atSaveLimit) {
                setShowUpgradeHint("save");
              } else {
                setShowSaveInput(true);
              }
            }}
            className={cn(
              "rounded-md border border-border bg-muted/50 px-sm py-1 text-xs transition",
              atSaveLimit
                ? "text-muted-foreground/50 cursor-not-allowed"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            + Save
            {atSaveLimit && <Lock className="h-2.5 w-2.5 ml-0.5 inline" />}
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
            />
            <button
              type="submit"
              disabled={!saveName.trim()}
              onMouseDown={(e) => e.preventDefault()}
              className="midi-btn text-[10px] px-2 py-0.5 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowSaveInput(false);
                setSaveName("");
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      {showUpgradeHint && (
        <div className="flex items-center gap-sm rounded-md border border-primary-400/30 bg-primary-500/5 px-sm py-1.5 text-xs text-primary-200">
          <Zap className="h-3.5 w-3.5 shrink-0 text-primary-400" />
          <span>
            {showUpgradeHint === "save" &&
              `You've reached the ${limits.maxSavedPatterns}-pattern limit. Upgrade for more.`}
            {showUpgradeHint === "variation" &&
              "Grid pattern variations are available on Basic and above."}
            {showUpgradeHint === "preset" &&
              "This genre pack requires a subscription."}
          </span>
          <button
            type="button"
            onClick={handleUpgrade}
            className="ml-auto rounded bg-primary-500 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary-600 transition"
          >
            View Plans
          </button>
          <button
            type="button"
            onClick={() => setShowUpgradeHint(null)}
            className="text-muted-foreground hover:text-foreground text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

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
          No saved patterns yet. Use &quot;+ Save&quot; to save your current pattern.
        </div>
      )}
    </div>
  );
}
