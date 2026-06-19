import { useCallback } from "react";
import type { StemEditorState } from "../../stem-editor-state";
import type { StemDefinition } from "../../types";
import { cn } from "../../utils/cn";

export interface ConfigureStemLaneProps {
  stem: StemDefinition;
  state: StemEditorState;
  onStateChange: (patch: Partial<StemEditorState>) => void;
}

export function ConfigureStemLane({
  stem,
  state,
  onStateChange,
}: ConfigureStemLaneProps) {
  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onStateChange({ mixer: { ...state.mixer, gain: Number(e.target.value) } });
    },
    [onStateChange, state.mixer],
  );

  const handlePan = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onStateChange({ mixer: { ...state.mixer, pan: Number(e.target.value) } });
    },
    [onStateChange, state.mixer],
  );

  const handlePitch = useCallback(
    (delta: number) => {
      const next = Math.max(-12, Math.min(12, state.pitchSemitones + delta));
      onStateChange({ pitchSemitones: next });
    },
    [onStateChange, state.pitchSemitones],
  );

  const toggleMute = useCallback(() => {
    onStateChange({ muted: !state.muted });
  }, [onStateChange, state.muted]);

  const toggleSolo = useCallback(() => {
    onStateChange({ soloed: !state.soloed });
  }, [onStateChange, state.soloed]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 transition",
        state.muted
          ? "border-white/5 bg-white/[0.01] opacity-50"
          : "border-white/10 bg-white/[0.02]",
      )}
    >
      {/* Stem label + color dot */}
      <div className="flex w-24 flex-shrink-0 items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: stem.glow }}
        />
        <span className="truncate text-sm font-medium text-foreground">
          {stem.label}
        </span>
      </div>

      {/* Mute */}
      <button
        type="button"
        onClick={toggleMute}
        className={cn(
          "flex h-7 w-9 items-center justify-center rounded-md border text-[11px] font-bold uppercase tracking-wider transition",
          state.muted
            ? "border-destructive-500/40 bg-destructive-500/20 text-destructive-400"
            : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
        )}
      >
        M
      </button>

      {/* Solo */}
      <button
        type="button"
        onClick={toggleSolo}
        className={cn(
          "flex h-7 w-9 items-center justify-center rounded-md border text-[11px] font-bold uppercase tracking-wider transition",
          state.soloed
            ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
            : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
        )}
      >
        S
      </button>

      {/* Volume fader */}
      <div className="flex flex-1 items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Vol</span>
        <input
          type="range"
          min={-60}
          max={12}
          step={0.5}
          value={state.mixer.gain}
          onChange={handleVolume}
          className="h-1 w-full max-w-24 cursor-pointer appearance-none rounded-full bg-white/15 accent-primary-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500"
        />
        <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
          {state.mixer.gain > 0 ? "+" : ""}
          {state.mixer.gain.toFixed(0)}
        </span>
      </div>

      {/* Pan knob strip */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Pan</span>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={state.mixer.pan}
          onChange={handlePan}
          className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/15 accent-primary-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500"
        />
        <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">
          {state.mixer.pan > 0 ? "R" : state.mixer.pan < 0 ? "L" : "C"}
        </span>
      </div>

      {/* Pitch shift */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">Pitch</span>
        <button
          type="button"
          onClick={() => handlePitch(-1)}
          disabled={state.pitchSemitones <= -12}
          className="flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-white/5 text-[11px] font-bold text-foreground transition hover:bg-white/10 disabled:opacity-30"
        >
          -1
        </button>
        <span className="flex h-6 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-[11px] tabular-nums text-foreground">
          {state.pitchSemitones > 0 ? "+" : ""}
          {state.pitchSemitones}
        </span>
        <button
          type="button"
          onClick={() => handlePitch(1)}
          disabled={state.pitchSemitones >= 12}
          className="flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-white/5 text-[11px] font-bold text-foreground transition hover:bg-white/10 disabled:opacity-30"
        >
          +1
        </button>
      </div>
    </div>
  );
}
