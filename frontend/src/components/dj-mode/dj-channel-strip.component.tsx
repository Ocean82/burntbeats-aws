/**
 * DjChannelStrip — Hardware-inspired vertical mixer channel for DJ mode.
 */
import { memo, useCallback } from "react";
import type { StemDefinition } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { cn } from "../../utils/cn";
import { formatDb } from "../../utils/mixer-format";
import { channelMuteSoloButtonClass } from "../multi-stem-editor/mixer-channel-controls";
import { PanKnob } from "../multi-stem-editor/pan-knob.component";
import { EqKnob } from "../multi-stem-editor/eq-knob.component";
import { MixerVerticalFader } from "../multi-stem-editor/mixer-vertical-fader.component";
import { ChannelMeter } from "../multi-stem-editor/channel-meter.component";
import { MixerSectionLabel } from "../multi-stem-editor/mixer-section-label.component";

const EQ_BANDS = [
  { key: "eqLow" as const, label: "Lo" },
  { key: "eqMid" as const, label: "Mid" },
  { key: "eqHigh" as const, label: "Hi" },
] as const;

const FADER_HEIGHT = 160;

export interface DjChannelStripProps {
  stem: StemDefinition;
  state: StemEditorState;
  isActive: boolean;
  playbackReady: boolean;
  showFaders: boolean;
  showEq: boolean;
  showPan: boolean;
  showMeters: boolean;
  isMeterPlaying: boolean;
  getStemAnalyserData?: (stemId: string) => Uint8Array | null;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onActiveStemChange: (stemId: string) => void;
}

export const DjChannelStrip = memo(function DjChannelStrip({
  stem,
  state,
  isActive,
  playbackReady,
  showFaders,
  showEq,
  showPan,
  showMeters,
  isMeterPlaying,
  getStemAnalyserData,
  onStemStateChange,
  onActiveStemChange,
}: DjChannelStripProps) {
  const { mixer, muted, soloed } = state;

  const handleActivate = useCallback(() => {
    onActiveStemChange(stem.id);
  }, [onActiveStemChange, stem.id]);

  const handleHeaderKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActiveStemChange(stem.id);
      }
    },
    [onActiveStemChange, stem.id],
  );

  const updateMixer = useCallback(
    (patch: Partial<typeof mixer>) =>
      onStemStateChange(stem.id, { mixer: { ...mixer, ...patch } }),
    [mixer, onStemStateChange, stem.id],
  );

  const meterGetter = useCallback(
    () => getStemAnalyserData?.(stem.id) ?? null,
    [getStemAnalyserData, stem.id],
  );

  const showFaderBank = showFaders || (showMeters && getStemAnalyserData);

  return (
    <div
      className={cn(
        "dj-channel-strip hardware-panel flex min-w-[6rem] w-[6rem] flex-col items-center overflow-visible rounded-xl border px-sm py-sm transition-all duration-200 ease",
        showEq ? "min-h-[22rem] sm:min-h-[24rem]" : "min-h-[18rem] sm:min-h-[20rem]",
        isActive
          ? "border-primary-500/50 ring-1 ring-primary-500/20 shadow-[0_0_30px_rgba(255,100,0,0.1)]"
          : "border-white/5",
      )}
      style={
        {
          "--stem-glow": stem.glow,
          "--stem-glow-soft": stem.glowSoft,
          "--led-color": stem.glow,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className={cn(
          "dj-channel-strip__header flex w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-xs border-b border-white/5 pb-3 transition-colors",
          isActive && "bg-white/[0.02]",
        )}
        onClick={handleActivate}
        onKeyDown={handleHeaderKeyDown}
        aria-label={`Select ${stem.label} channel`}
        aria-pressed={isActive}
      >
        <div className={cn("led-indicator mb-1", isActive && "led-indicator--active")} aria-hidden />
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-secondary-foreground">
          {stem.label}
        </span>
      </button>

      {showPan && (
        <div
          className="dj-channel-strip__pan flex shrink-0 flex-col items-center gap-0.5 py-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MixerSectionLabel>Pan</MixerSectionLabel>
          <PanKnob
            variant="console"
            value={mixer.pan}
            disabled={!playbackReady}
            color={stem.glow}
            ariaLabel={`${stem.label} pan`}
            onChange={(pan) => updateMixer({ pan })}
          />
        </div>
      )}

      {showEq && (
        <div
          className="dj-channel-strip__eq flex w-full shrink-0 flex-col items-center gap-0.5 border-b border-border pb-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MixerSectionLabel>Eq</MixerSectionLabel>
          <div className="flex items-end justify-center gap-0.5">
            {EQ_BANDS.map(({ key, label }) => (
              <EqKnob
                key={key}
                value={mixer[key]}
                label={label}
                disabled={!playbackReady}
                color={stem.glow}
                ariaLabel={`${stem.label} ${label} EQ`}
                onChange={(v) => updateMixer({ [key]: v })}
              />
            ))}
          </div>
        </div>
      )}

      {showFaderBank && (
        <div
          className="dj-channel-strip__fader-bank flex shrink-0 flex-col items-center gap-0.5 py-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MixerSectionLabel>Vol</MixerSectionLabel>
          <div className="flex items-center justify-center gap-2xs">
            {showMeters && getStemAnalyserData && (
              <ChannelMeter
                getAnalyserData={meterGetter}
                color={stem.glow}
                isPlaying={isMeterPlaying}
                height={FADER_HEIGHT}
                width={8}
                colorMode="vu-gradient"
              />
            )}
            {showFaders && (
              <MixerVerticalFader
                value={mixer.gain}
                disabled={!playbackReady}
                height={FADER_HEIGHT}
                accentColor={stem.glow}
                ariaLabel={`${stem.label} volume`}
                muted={muted}
                onChange={(gain) => updateMixer({ gain })}
                onReset={() => updateMixer({ gain: 0 })}
              />
            )}
          </div>
        </div>
      )}

      <div className="dj-channel-strip__footer mt-auto flex w-full shrink-0 flex-col items-center gap-2xs pt-1">
        {showFaders && (
          <span
            className={cn(
              "font-mono text-[9px] leading-none tabular-nums",
              muted ? "text-muted-foreground" : "text-muted-foreground",
            )}
            aria-hidden
          >
            {formatDb(mixer.gain)} dB
          </span>
        )}
        <div
          className="flex items-center justify-center gap-xs"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStemStateChange(stem.id, { muted: !muted });
            }}
            disabled={!playbackReady}
            aria-label={muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
            aria-pressed={muted}
            className={cn(
              channelMuteSoloButtonClass(muted, "mute", "compact"),
              "dj-ms-btn-touch",
            )}
          >
            M
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStemStateChange(stem.id, { soloed: !soloed });
            }}
            disabled={!playbackReady}
            aria-label={soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
            aria-pressed={soloed}
            className={cn(
              channelMuteSoloButtonClass(soloed, "solo", "compact"),
              "dj-ms-btn-touch",
            )}
          >
            S
          </button>
        </div>
      </div>
    </div>
  );
});
