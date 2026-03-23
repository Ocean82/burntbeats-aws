import { memo } from "react";
import { Headphones, Play, Square, Volume2, VolumeX } from "lucide-react";
import type { StemDefinition } from "../../types";
import { cn } from "../../utils/cn";
import type { StemEditorState } from "../../stem-editor-state";
import { stemThemeVariables } from "../../utils/stemThemeVariables";

const MIN_TRIM_GAP_PCT = 2;

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

interface StemControlsProps {
  stem: StemDefinition;
  state: StemEditorState;
  duration: number;
  isPreviewPlaying: boolean;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
  onPreviewStem: (stemId: string) => void;
}

export const StemControls = memo(function StemControls({
  stem,
  state,
  duration,
  isPreviewPlaying,
  onStemStateChange,
  onPreviewStem,
}: StemControlsProps) {
  const { mixer, trim, muted, soloed } = state;
  const trimStartSec = duration * (trim.start / 100);
  const trimEndSec = duration * (trim.end / 100);

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4"
      style={stemThemeVariables(stem) as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <span className="stem-header-glow-dot h-2.5 w-2.5 shrink-0 rounded-full" />
        <span className="font-semibold text-sm text-white">{stem.label}</span>
        <span className="text-xs text-white/50">{stem.subtitle}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPreviewStem(stem.id)}
            aria-label={isPreviewPlaying ? `Stop ${stem.label} preview` : `Preview ${stem.label}`}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition",
              isPreviewPlaying
                ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
                : "border-white/10 bg-white/5 text-white/70 hover:text-white"
            )}
          >
            {isPreviewPlaying ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isPreviewPlaying ? "Stop" : "Hear"}
          </button>
          <button
            type="button"
            onClick={() => onStemStateChange(stem.id, { soloed: !soloed })}
            aria-label={soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition",
              soloed
                ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
                : "border-white/10 bg-white/5 text-white/70 hover:text-white"
            )}
          >
            <Headphones className="h-3 w-3" />
            Solo
          </button>
          <button
            type="button"
            onClick={() => onStemStateChange(stem.id, { muted: !muted })}
            aria-label={muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition",
              muted
                ? "border-red-400/40 bg-red-500/20 text-red-200"
                : "border-white/10 bg-white/5 text-white/70 hover:text-white"
            )}
          >
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Trim in</span>
            <span>{formatTime(trimStartSec)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={trim.end - MIN_TRIM_GAP_PCT}
            step={0.1}
            value={trim.start}
            aria-label={`${stem.label} trim in`}
            onChange={(event) => onStemStateChange(stem.id, { trim: { ...trim, start: Number(event.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Trim out</span>
            <span>{formatTime(trimEndSec)}</span>
          </div>
          <input
            type="range"
            min={trim.start + MIN_TRIM_GAP_PCT}
            max={100}
            step={0.1}
            value={trim.end}
            aria-label={`${stem.label} trim out`}
            onChange={(event) => onStemStateChange(stem.id, { trim: { ...trim, end: Number(event.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Pan</span>
            <span>{mixer.pan === 0 ? "C" : mixer.pan > 0 ? `R${mixer.pan}` : `L${Math.abs(mixer.pan)}`}</span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={mixer.pan}
            aria-label={`${stem.label} pan`}
            onChange={(event) => onStemStateChange(stem.id, { mixer: { ...mixer, pan: Number(event.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span title="Stereo width: 0 = normal, negative = narrower, positive = wider">Width</span>
            <span>{mixer.width === 0 ? "0" : mixer.width > 0 ? `+${mixer.width}` : mixer.width}</span>
          </div>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={mixer.width}
            aria-label={`${stem.label} stereo width`}
            onChange={(event) => onStemStateChange(stem.id, { mixer: { ...mixer, width: Number(event.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
      </div>

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="sr-only">EQ, dynamics, and effects</legend>
      {/* EQ */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>EQ Low</span>
            <span>{mixer.eqLow > 0 ? `+${mixer.eqLow}` : mixer.eqLow} dB</span>
          </div>
          <input
            type="range" min={-12} max={12} step={0.5}
            value={mixer.eqLow}
            aria-label={`${stem.label} EQ low`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, eqLow: Number(e.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>EQ Mid</span>
            <span>{mixer.eqMid > 0 ? `+${mixer.eqMid}` : mixer.eqMid} dB</span>
          </div>
          <input
            type="range" min={-12} max={12} step={0.5}
            value={mixer.eqMid}
            aria-label={`${stem.label} EQ mid`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, eqMid: Number(e.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>EQ High</span>
            <span>{mixer.eqHigh > 0 ? `+${mixer.eqHigh}` : mixer.eqHigh} dB</span>
          </div>
          <input
            type="range" min={-12} max={12} step={0.5}
            value={mixer.eqHigh}
            aria-label={`${stem.label} EQ high`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, eqHigh: Number(e.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
      </div>

      {/* Effects */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Reverb</span>
            <span>{mixer.reverbWet}%</span>
          </div>
          <input
            type="range" min={0} max={100} step={1}
            value={mixer.reverbWet}
            aria-label={`${stem.label} reverb wet`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, reverbWet: Number(e.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Delay</span>
            <span>{mixer.delayWet}%</span>
          </div>
          <input
            type="range" min={0} max={100} step={1}
            value={mixer.delayWet}
            aria-label={`${stem.label} delay wet`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, delayWet: Number(e.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
      </div>

      {/* Compressor */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Comp Threshold</span>
            <span>{mixer.compThreshold} dB</span>
          </div>
          <input
            type="range" min={-60} max={0} step={1}
            value={mixer.compThreshold}
            aria-label={`${stem.label} compressor threshold`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, compThreshold: Number(e.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Comp Ratio</span>
            <span>{mixer.compRatio}:1</span>
          </div>
          <input
            type="range" min={1} max={20} step={0.5}
            value={mixer.compRatio}
            aria-label={`${stem.label} compressor ratio`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, compRatio: Number(e.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
      </div>
      </fieldset>

    </div>
  );
});
