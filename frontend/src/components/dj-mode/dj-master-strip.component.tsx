/**
 * DjMasterStrip — Master output column in the DJ mixer console row.
 */
import { memo, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "../../utils/cn";
import { StereoVUMeter } from "../StereoVUMeter";
import { MixerVerticalFader } from "../multi-stem-editor/mixer-vertical-fader.component";
import { MixerSectionLabel } from "../multi-stem-editor/mixer-section-label.component";

const FADER_HEIGHT = 160;
const MASTER_MIN = 0;
const MASTER_MAX = 1.5;
const MASTER_STEP = 0.01;

/** Convert linear master gain (0–1.5) to dB for display. */
export function formatMasterGain(gain: number): string {
  if (gain <= 0) return "-∞";
  const db = 20 * Math.log10(gain);
  if (db >= 0) return `+${db.toFixed(1)} dB`;
  return `${db.toFixed(1)} dB`;
}

export interface DjMasterStripProps {
  masterVolume: number;
  masterMuted: boolean;
  masterLimiterEnabled: boolean;
  playbackReady: boolean;
  isMeterPlaying: boolean;
  onMasterVolumeChange: (value: number) => void;
  onMasterMuteToggle: () => void;
  onMasterReset: () => void;
  onMasterLimiterEnabledChange: (enabled: boolean) => void;
  getMasterAnalyserData: () => Uint8Array | null;
  getMasterAnalyserDataLeft: () => Uint8Array | null;
  getMasterAnalyserDataRight: () => Uint8Array | null;
}

export const DjMasterStrip = memo(function DjMasterStrip({
  masterVolume,
  masterMuted,
  masterLimiterEnabled,
  playbackReady,
  isMeterPlaying,
  onMasterVolumeChange,
  onMasterMuteToggle,
  onMasterReset,
  onMasterLimiterEnabledChange,
  getMasterAnalyserData,
  getMasterAnalyserDataLeft,
  getMasterAnalyserDataRight,
}: DjMasterStripProps) {
  const displayVolume = masterMuted ? 0 : masterVolume;

  const handleFaderChange = useCallback(
    (v: number) => {
      if (masterMuted && v > 0) {
        onMasterMuteToggle();
      }
      onMasterVolumeChange(v);
    },
    [masterMuted, onMasterMuteToggle, onMasterVolumeChange],
  );

  return (
    <div
      className={cn(
        "dj-master-strip dj-channel-strip flex min-w-[6.5rem] w-[6.5rem] flex-col items-center overflow-visible rounded-xl border border-border px-sm py-sm",
        "bg-gradient-to-b from-white/[0.08] to-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        "min-h-[18rem] sm:min-h-[22rem]",
      )}
    >
      <div className="dj-channel-strip__header flex w-full shrink-0 items-center justify-center border-b border-border pb-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-primary-200/90">
          Master
        </span>
      </div>

      <div
        className="flex w-full shrink-0 flex-col items-center gap-2xs py-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MixerSectionLabel>Level</MixerSectionLabel>
        <StereoVUMeter
          getAnalyserData={getMasterAnalyserData}
          getAnalyserDataLeft={getMasterAnalyserDataLeft}
          getAnalyserDataRight={getMasterAnalyserDataRight}
          isPlaying={isMeterPlaying}
          height={FADER_HEIGHT}
          width={48}
        />
      </div>

      <div
        className="flex shrink-0 flex-col items-center gap-2xs py-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MixerSectionLabel>Vol</MixerSectionLabel>
        <MixerVerticalFader
          value={displayVolume}
          min={MASTER_MIN}
          max={MASTER_MAX}
          step={MASTER_STEP}
          disabled={!playbackReady}
          height={FADER_HEIGHT}
          accentColor="#f59e0b"
          ariaLabel="Master output volume"
          muted={masterMuted}
          formatValue={formatMasterGain}
          resetValue={1}
          onChange={handleFaderChange}
          onReset={onMasterReset}
        />
      </div>

      <div className="mt-auto flex w-full shrink-0 flex-col items-center gap-xs pt-1">
        <span
          className={cn(
            "font-mono text-[9px] leading-none tabular-nums",
            masterMuted
              ? "text-destructive-400"
              : masterVolume > 1.05
                ? "text-primary-300"
                : "text-muted-foreground",
          )}
          aria-hidden
        >
          {masterMuted ? "MUTE" : formatMasterGain(masterVolume)}
        </span>
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMasterMuteToggle();
            }}
            disabled={!playbackReady}
            aria-label={masterMuted ? "Unmute master" : "Mute master"}
            className={cn(
              "dj-ms-btn-touch flex h-8 w-8 items-center justify-center rounded transition-all duration-200 ease",
              masterMuted
                ? "bg-destructive-500/20 text-destructive-400 hover:bg-destructive-500/30"
                : "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground",
            )}
          >
            {masterMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMasterLimiterEnabledChange(!masterLimiterEnabled);
            }}
            disabled={!playbackReady}
            aria-label="Master limiter"
            aria-pressed={masterLimiterEnabled}
            className={cn(
              "dj-ms-btn-touch rounded border px-xs py-1 text-[9px] font-bold uppercase tracking-wide transition-all duration-200 ease",
              masterLimiterEnabled
                ? "border-primary-400/50 bg-primary-500/20 text-primary-200"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Lim
          </button>
        </div>
      </div>
    </div>
  );
});
