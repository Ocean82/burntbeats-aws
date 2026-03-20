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
  const { mixer, trim, pitchSemitones, timeStretch, muted, soloed } = state;
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
            <span>Volume</span>
            <span>{mixer.gain > 0 ? "+" : ""}{mixer.gain.toFixed(1)} dB</span>
          </div>
          <input
            type="range"
            min={-24}
            max={12}
            step={0.5}
            value={mixer.gain}
            aria-label={`${stem.label} volume`}
            onChange={(event) => onStemStateChange(stem.id, { mixer: { ...mixer, gain: Number(event.target.value) } })}
            className="stem-accent-slider w-full"
          />
        </div>
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span title="Pitch shift in semitones">Pitch</span>
            <span>{pitchSemitones === 0 ? "0" : pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} st</span>
          </div>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={pitchSemitones ?? 0}
            aria-label={`${stem.label} pitch`}
            onChange={(event) => {
              const pitch = Number(event.target.value);
              const stretch = timeStretch ?? 1;
              onStemStateChange(stem.id, { pitchSemitones: pitch, rate: Math.pow(2, pitch / 12) / stretch });
            }}
            className="stem-accent-slider w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span title="Time stretch: duration multiplier">Time stretch</span>
            <span>{(timeStretch ?? 1).toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.01}
            value={timeStretch ?? 1}
            aria-label={`${stem.label} time stretch`}
            onChange={(event) => {
              const stretch = Number(event.target.value);
              const pitch = pitchSemitones ?? 0;
              onStemStateChange(stem.id, { timeStretch: stretch, rate: Math.pow(2, pitch / 12) / stretch });
            }}
            className="stem-accent-slider w-full"
          />
        </div>
      </div>
    </div>
  );
});
