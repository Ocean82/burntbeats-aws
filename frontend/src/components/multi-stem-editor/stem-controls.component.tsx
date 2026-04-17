import { memo, useCallback } from "react";
import {
  Headphones,
  Play,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { StemDefinition } from "../../types";
import { cn } from "../../utils/cn";
import type { StemEditorState } from "../../stem-editor-state";

const MIN_TRIM_GAP_PCT = 2;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

interface StemControlsProps {
  stem: StemDefinition;
  state: StemEditorState;
  duration: number;
  audioReady: boolean;
  isPreviewPlaying: boolean;
  isLoadingPreview: boolean;
  onStemStateChange: (
    stemId: string,
    next: Partial<StemEditorState>
  ) => void;
  onPreviewStem: (stemId: string) => void;
}

export const StemControls = memo(function StemControls({
  stem,
  state,
  duration,
  audioReady,
  isPreviewPlaying,
  isLoadingPreview,
  onStemStateChange,
  onPreviewStem,
}: StemControlsProps) {
  const { mixer, trim, muted, soloed } = state;

  const trimStartSec = duration * (trim.start / 100);
  const trimEndSec = duration * (trim.end / 100);

  const updateMixer = useCallback(
    (patch: Partial<typeof mixer>) =>
      onStemStateChange(stem.id, {
        mixer: { ...mixer, ...patch },
      }),
    [mixer, onStemStateChange, stem.id]
  );

  const updateTrimStart = (value: number) => {
    const clamped = Math.min(value, trim.end - MIN_TRIM_GAP_PCT);
    onStemStateChange(stem.id, {
      trim: { ...trim, start: clamped },
    });
  };

  const updateTrimEnd = (value: number) => {
    const clamped = Math.max(value, trim.start + MIN_TRIM_GAP_PCT);
    onStemStateChange(stem.id, {
      trim: { ...trim, end: clamped },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Headphones className="h-4 w-4 text-white/60" />
        <div className="flex flex-col">
          <span className="text-sm font-medium">{stem.label}</span>
          {stem.subtitle && (
            <span className="text-xs text-white/50">{stem.subtitle}</span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onPreviewStem(stem.id)}
          disabled={!audioReady || isLoadingPreview}
          title={!audioReady ? "This stem is still loading." : undefined}
          aria-label={
            isPreviewPlaying
              ? `Stop ${stem.label} preview`
              : `Preview ${stem.label}`
          }
          className={cn(
            "flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
            isPreviewPlaying
              ? "border-amber-400/45 bg-amber-500/20 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.18)]"
              : "border-white/10 bg-white/5 text-white/75 hover:border-white/20 hover:text-white",
            isLoadingPreview && "cursor-not-allowed opacity-50",
          )}
        >
          {isLoadingPreview ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : isPreviewPlaying ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Headphones className="h-3.5 w-3.5" />
          )}
          {isLoadingPreview
            ? "Loading..."
            : isPreviewPlaying
              ? "Stop preview"
              : "Preview"}
        </button>

        <button
          type="button"
          onClick={() => onStemStateChange(stem.id, { soloed: !soloed })}
          disabled={!audioReady}
          aria-label={soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
          className={cn(
            "min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium",
            soloed
              ? "border-amber-400/45 bg-amber-500/20 text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.14)]"
              : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
          )}
        >
          Solo
        </button>

        <button
          type="button"
          onClick={() => onStemStateChange(stem.id, { muted: !muted })}
          disabled={!audioReady}
          aria-label={muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
          className={cn(
            "flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
            muted
              ? "border-red-400/40 bg-red-500/20 text-red-200"
              : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
          )}
        >
          {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>

      {/* Trim */}
      <div>
        <label className="text-xs">Trim in {formatTime(trimStartSec)}</label>
        <input
          type="range"
          min={0}
          max={Math.max(0, trim.end - MIN_TRIM_GAP_PCT)}
          step={0.1}
          value={trim.start}
          disabled={!audioReady}
          aria-label={`${stem.label} trim in`}
          onChange={(e) => updateTrimStart(Number(e.target.value))}
          className="stem-accent-slider w-full"
        />
      </div>

      <div>
        <label className="text-xs">Trim out {formatTime(trimEndSec)}</label>
        <input
          type="range"
          min={Math.min(100, trim.start + MIN_TRIM_GAP_PCT)}
          max={100}
          step={0.1}
          value={trim.end}
          disabled={!audioReady}
          aria-label={`${stem.label} trim out`}
          onChange={(e) => updateTrimEnd(Number(e.target.value))}
          className="stem-accent-slider w-full"
        />
      </div>

      {/* Mixer */}
      <div>
        <label className="text-xs">Pan</label>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={mixer.pan}
          disabled={!audioReady}
          aria-label={`${stem.label} pan`}
          onChange={(e) => updateMixer({ pan: Number(e.target.value) })}
          className="stem-accent-slider w-full"
        />
      </div>

      <div>
        <label className="text-xs">Width</label>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={mixer.width}
          disabled={!audioReady}
          aria-label={`${stem.label} width`}
          onChange={(e) => updateMixer({ width: Number(e.target.value) })}
          className="stem-accent-slider w-full"
        />
      </div>
    </div>
  );
});

/* ===================== TESTS =====================
   Jest + @testing-library/react
================================================ */

// stem-controls.component.test.tsx

// import { render, fireEvent } from "@testing-library/react";
// import { StemControls } from "./stem-controls.component";

// test("clamps trim start and end", () => {
//   const onChange = jest.fn();
//   const state = {
//     mixer: { pan: 0, width: 0 },
//     trim: { start: 40, end: 50 },
//     muted: false,
//     soloed: false,
//   } as any;
//
//   const { getByLabelText } = render(
//     <StemControls
//       stem={{ id: "s1", label: "Drums" } as any}
//       state={state}
//       duration={100}
//       audioReady
//       isPreviewPlaying={false}
//       isLoadingPreview={false}
//       onStemStateChange={onChange}
//       onPreviewStem={() => {}}
//     />
//   );
//
//   fireEvent.change(getByLabelText(/Trim in/i), { target: { value: 49 } });
//   expect(onChange).toHaveBeenCalled();
// });
