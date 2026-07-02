/**
 * PatternChainView — multi-bar pattern arrangement grid.
 *
 * Lets users:
 *  - Add selected preset patterns to a chain
 *  - Reorder (move up / down)
 *  - Set repeat count per pattern slot
 *  - Remove slots
 *  - Play the full chain
 *  - Export the chain as a single multi-bar MIDI file
 */

import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronUp, Minus, Plus, Trash2, Play, Square, Download, GripVertical, Music2 } from "lucide-react";
import type { BeatPreset, UseBeatMakerReturn } from "../../hooks/useBeatMaker";
import type { UsePatternChainReturn } from "../../hooks/usePatternChain";
import { downloadMidiBlob, exportNotesToMidi } from "../../utils/midiExport";
import { patternToMidiNotes } from "../../audio/beatPatternExport";
import { saveBeatHandoff } from "../../utils/beatToMidiHandoff";
import { cn } from "../../utils/cn";

export interface PatternChainViewProps {
  presets: BeatPreset[];
  patternChain: UsePatternChainReturn;
  beatMaker: UseBeatMakerReturn;
  canExportFullMidi?: boolean;
  onClose?: () => void;
}

export function PatternChainView({
  presets,
  patternChain: _patternChain,
  beatMaker,
  canExportFullMidi = true,
  onClose,
}: PatternChainViewProps) {
  const [, navigate] = useLocation();
  const [selectedPresetId, setSelectedPresetId] = useState<string>(presets[0]?.name ?? "");
  const [chainPlaying, setChainPlaying] = useState(false);
  const { kit, rowStates, start, stop, setPattern, setBpm, setSwing, setSteps } = beatMaker;
  const { chain, addToChain, removeFromChain, moveUp, moveDown, setRepeat, clearChain, totalBars, totalSteps, exportFlattened } = _patternChain;

  const handleChainPlayback = useCallback(() => {
    if (chainPlaying) {
      stop();
      setChainPlaying(false);
      return;
    }

    const { pattern, bpm, swing, steps } = exportFlattened();
    if (pattern.length === 0) return;

    setPattern(pattern);
    setBpm(bpm);
    setSwing(swing);
    setSteps(steps as import("../../audio/types").PatternLength);

    start();
    setChainPlaying(true);
  }, [chainPlaying, start, stop, setPattern, setBpm, setSwing, setSteps, exportFlattened]);

  const handleAdd = useCallback(() => {
    if (!selectedPresetId) return;
    const selectedPreset = presets.find((p) => p.name === selectedPresetId);
    if (!selectedPreset) return;
    addToChain(selectedPreset);
  }, [selectedPresetId, presets, addToChain]);

  const handleChainExport = useCallback(() => {
    const { pattern, bpm, swing, steps } = exportFlattened();
    if (pattern.length === 0 || steps === 0) return;

    const notes = patternToMidiNotes({
      pattern,
      rowStates,
      kit,
      bpm,
      swing,
      steps: steps as import("../../audio/types").PatternLength,
      canExportFullMidi: true,
    });

    const blob = exportNotesToMidi(notes, bpm, `Pattern Chain (${totalBars} bars)`);
    downloadMidiBlob(blob, "pattern-chain.mid");
  }, [rowStates, kit, exportFlattened, totalBars]);

  const openChainInPianoRoll = useCallback(() => {
    const { pattern, bpm, swing, steps } = exportFlattened();
    if (pattern.length === 0 || steps === 0) return;

    const notes = patternToMidiNotes({
      pattern,
      rowStates,
      kit,
      bpm,
      swing,
      steps: steps as import("../../audio/types").PatternLength,
      canExportFullMidi,
    });
    saveBeatHandoff({
      notes,
      bpm,
      name: `Pattern Chain (${totalBars} bars)`,
    });
    navigate("/midi?beat-handoff=1");
  }, [exportFlattened, rowStates, kit, canExportFullMidi, totalBars, navigate]);

  return (
    <div className="space-y-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Pattern Chain</h3>
          <p className="text-xs text-muted-foreground">
            {totalBars} bars · {chain.length} sections · {totalSteps} steps
          </p>
        </div>
        <div className="flex gap-xs">
          <button
            type="button"
            onClick={handleChainPlayback}
            className={cn("midi-btn text-xs", chainPlaying && "bg-error/20 text-error")}
            aria-label={chainPlaying ? "Stop chain playback" : "Play chain"}
          >
            {chainPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {chainPlaying ? "Stop" : "Play Chain"}
          </button>
          <button
            type="button"
            onClick={openChainInPianoRoll}
            disabled={chain.length === 0}
            className={cn("midi-btn text-xs", chain.length === 0 && "opacity-50")}
            data-testid="beat-chain-edit-piano-roll"
            aria-label="Edit chain in piano roll"
          >
            <Music2 className="h-3.5 w-3.5" />
            Piano roll
          </button>
          <button
            type="button"
            onClick={handleChainExport}
            disabled={chain.length === 0}
            className={cn("midi-btn text-xs", chain.length === 0 && "opacity-50")}
            aria-label="Export chain as MIDI"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="midi-btn text-xs text-muted-foreground"
              aria-label="Close pattern chain"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Add to chain */}
      {presets.length > 0 && (
        <div className="flex gap-xs">
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="flex-1 rounded border border-border bg-muted px-xs py-0.5 text-xs"
            aria-label="Select preset to add"
          >
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({Math.ceil(p.steps / 16)} bar{Math.ceil(p.steps / 16) !== 1 ? "s" : ""})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={chain.length >= 32}
            className="midi-btn text-xs"
            aria-label="Add to chain"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
          <button
            type="button"
            onClick={clearChain}
            disabled={chain.length === 0}
            className={cn("midi-btn text-xs text-muted-foreground", chain.length === 0 && "opacity-50")}
            aria-label="Clear chain"
          >
            Clear
          </button>
        </div>
      )}

      {/* Chain slots */}
      {chain.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-md text-center text-xs text-muted-foreground">
          No patterns in chain. Select a preset above and click Add.
        </div>
      ) : (
        <div className="space-y-xs">
          {chain.map((entry, idx) => (
            <div
              key={entry.id}
              className="flex items-center gap-xs rounded-lg border border-border bg-muted/40 p-xs"
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />

              <span className="text-[10px] font-medium tabular-nums w-5 text-center text-muted-foreground">
                {idx + 1}
              </span>

              <span className="flex-1 truncate text-xs font-medium" title={entry.preset.name}>
                {entry.preset.name}
              </span>

              <span className="text-[10px] text-muted-foreground">
                {Math.ceil(entry.preset.steps / 16)} bar{Math.ceil(entry.preset.steps / 16) !== 1 ? "s" : ""}
              </span>

              {/* Repeat count */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setRepeat(entry.id, entry.repeatCount - 1)}
                  disabled={entry.repeatCount <= 1}
                  className={cn(
                    "rounded p-0.5 transition",
                    entry.repeatCount <= 1
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                  aria-label={`Decrease repeat for ${entry.preset.name}`}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-[10px] tabular-nums">{entry.repeatCount}</span>
                <button
                  type="button"
                  onClick={() => setRepeat(entry.id, entry.repeatCount + 1)}
                  className="rounded p-0.5 hover:bg-muted text-muted-foreground"
                  aria-label={`Increase repeat for ${entry.preset.name}`}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {/* Move / delete */}
              <div className="flex gap-0">
                <button
                  type="button"
                  onClick={() => moveUp(entry.id)}
                  disabled={idx === 0}
                  className={cn(
                    "rounded p-0.5 transition",
                    idx === 0
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                  aria-label={`Move ${entry.preset.name} up`}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(entry.id)}
                  disabled={idx === chain.length - 1}
                  className={cn(
                    "rounded p-0.5 transition",
                    idx === chain.length - 1
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                  aria-label={`Move ${entry.preset.name} down`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeFromChain(entry.id)}
                  className="rounded p-0.5 hover:bg-error/20 text-error transition"
                  aria-label={`Remove ${entry.preset.name} from chain`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
