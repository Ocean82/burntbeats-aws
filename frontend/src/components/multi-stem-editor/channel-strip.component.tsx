/**
 * ChannelStrip — A single vertical mixer channel for one stem.
 *
 * Signal flow (top → bottom):
 *   Stem label → Pitch → Tempo → EQ (collapsible) → FX (collapsible)
 *   → Pan knob → Width → Mute / Solo / Preview → Volume fader + meter
 */
import { memo, useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Headphones,
  RotateCcw,
} from "lucide-react";
import type { StemDefinition } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { cn } from "../../utils/cn";
import {
  PITCH_MIN,
  PITCH_MAX,
  PITCH_STEP,
  TIME_STRETCH_MIN,
  TIME_STRETCH_MAX,
  TIME_STRETCH_STEP,
  timeStretchToDisplayPercent,
} from "../../constants/mixerRanges";
import { formatDb } from "../../utils/mixer-format";
import { channelMuteSoloButtonClass } from "./mixer-channel-controls";
import { EditableDbValue } from "./editable-db-value.component";
import { PanKnob } from "./pan-knob.component";
import { ChannelMeter } from "./channel-meter.component";
import { MixerVerticalFader } from "./mixer-vertical-fader.component";
import { MixerSectionLabel } from "./mixer-section-label.component";

export interface ChannelStripProps {
  stem: StemDefinition;
  state: StemEditorState;
  isActive: boolean;
  audioReady: boolean;
  isPreviewPlaying: boolean;
  isLoadingPreview: boolean;
  isMeterPlaying: boolean;
  getStemAnalyserData?: (stemId: string) => Uint8Array | null;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onPreviewStem: (stemId: string) => void;
  onActivate: (stemId: string) => void;
  onResetStem?: (stemId: string) => void;
  isModified?: boolean;
}

export const ChannelStrip = memo(function ChannelStrip({
  stem,
  state,
  isActive,
  audioReady,
  isPreviewPlaying,
  isLoadingPreview,
  isMeterPlaying,
  getStemAnalyserData,
  onStemStateChange,
  onPreviewStem,
  onActivate,
  onResetStem,
  isModified = false,
}: ChannelStripProps) {
  const { mixer, muted, soloed } = state;
  const eqStorageKey = `bb-channel-${stem.id}-eq-open`;
  const fxStorageKey = `bb-channel-${stem.id}-fx-open`;
  const [eqOpen, setEqOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const v = localStorage.getItem(eqStorageKey);
    if (v != null) return v === "1";
    const first = !localStorage.getItem("bb-has-opened-eq-fx");
    if (first) localStorage.setItem("bb-has-opened-eq-fx", "1");
    return first;
  });
  const [fxOpen, setFxOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const v = localStorage.getItem(fxStorageKey);
    if (v != null) return v === "1";
    return !localStorage.getItem("bb-has-opened-eq-fx") ? true : false;
  });
  const setEqOpenPersist = (open: boolean) => {
    setEqOpen(open);
    localStorage.setItem(eqStorageKey, open ? "1" : "0");
  };
  const setFxOpenPersist = (open: boolean) => {
    setFxOpen(open);
    localStorage.setItem(fxStorageKey, open ? "1" : "0");
  };

  const updateMixer = useCallback(
    (patch: Partial<typeof mixer>) =>
      onStemStateChange(stem.id, { mixer: { ...mixer, ...patch } }),
    [mixer, onStemStateChange, stem.id],
  );

  const meterGetter = useCallback(
    () => getStemAnalyserData?.(stem.id) ?? null,
    [getStemAnalyserData, stem.id],
  );

  return (
    <div
      className={cn(
        "channel-strip flex w-[120px] min-w-[120px] flex-col items-stretch gap-0 rounded-xl border bg-secondary transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400/50",
        isActive
          ? "channel-strip--active shadow-[0_0_12px_rgba(255,255,255,0.06)]"
          : "border-border hover:border-border",
      )}
      style={{ "--stem-glow": stem.glow } as React.CSSProperties}
    >
      {/* ── Stem Label (click to select) ── */}
      <div className="channel-strip__header flex items-center gap-2xs border-b border-border px-xs py-xs">
        <button
          type="button"
          className="flex min-h-[40px] flex-1 items-center gap-xs rounded-lg px-1 transition-colors hover:bg-muted/[0.04]"
          onClick={() => onActivate(stem.id)}
          onDoubleClick={(e) => {
            e.preventDefault();
            onResetStem?.(stem.id);
          }}
          aria-label={
            isModified
              ? `Select ${stem.label} channel (modified)`
              : `Select ${stem.label} channel`
          }
          aria-pressed={isActive}
        >
          <span
            className={cn(
              "channel-strip__dot h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-transparent",
              isActive && "channel-strip__dot--active",
              isModified && "ring-primary-400/70",
            )}
            aria-hidden
          />
          <span className="text-xs font-semibold truncate text-secondary-foreground">
            {stem.label}
          </span>
        </button>
        {onResetStem && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResetStem(stem.id);
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary-200 transition"
            aria-label={`Reset ${stem.label} channel`}
            title="Reset channel"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Pitch ── */}
      <ControlSection label="Pitch" value={`${state.pitchSemitones > 0 ? "+" : ""}${state.pitchSemitones.toFixed(1)} st`}>
        <input
          type="range"
          min={PITCH_MIN}
          max={PITCH_MAX}
          step={PITCH_STEP}
          value={state.pitchSemitones}
          disabled={!audioReady}
          onChange={(e) =>
            onStemStateChange(stem.id, { pitchSemitones: Number(e.target.value) })
          }
          onDoubleClick={() => onStemStateChange(stem.id, { pitchSemitones: 0 })}
          className="stem-accent-slider w-full"
          aria-label={`${stem.label} pitch shift`}
        />
      </ControlSection>

      {/* ── Tempo ── */}
      <ControlSection
        label="Tempo"
        value={`${timeStretchToDisplayPercent(state.timeStretch) >= 0 ? "+" : ""}${timeStretchToDisplayPercent(state.timeStretch)}%`}
      >
        <input
          type="range"
          min={TIME_STRETCH_MIN}
          max={TIME_STRETCH_MAX}
          step={TIME_STRETCH_STEP}
          value={state.timeStretch}
          disabled={!audioReady}
          onChange={(e) =>
            onStemStateChange(stem.id, { timeStretch: Number(e.target.value) })
          }
          onDoubleClick={() => onStemStateChange(stem.id, { timeStretch: 1.0 })}
          className="stem-accent-slider w-full"
          aria-label={`${stem.label} tempo`}
        />
      </ControlSection>

      {/* ── EQ (collapsible) ── */}
      <CollapsibleSection
        title="EQ"
        collapsedLabel="EQ · FX"
        open={eqOpen}
        onToggle={() => setEqOpenPersist(!eqOpen)}
      >
        {([
          { key: "eqLow" as const, label: "Lo" },
          { key: "eqLowMid" as const, label: "LM" },
          { key: "eqMid" as const, label: "Mid" },
          { key: "eqHigh" as const, label: "Hi" },
        ]).map(({ key, label }) => (
          <div key={key} className="flex items-center gap-xs">
            <span className="w-6 text-[9px] text-muted-foreground shrink-0">{label}</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={mixer[key]}
              disabled={!audioReady}
              onChange={(e) => updateMixer({ [key]: Number(e.target.value) })}
              onDoubleClick={() => updateMixer({ [key]: 0 })}
              className="stem-accent-slider min-w-0 flex-1"
              aria-label={`${stem.label} ${label} EQ`}
            />
            <span className="w-8 text-right font-mono text-[8px] text-muted-foreground tabular-nums shrink-0">
              {formatDb(mixer[key])}
            </span>
          </div>
        ))}
      </CollapsibleSection>

      {/* ── FX (collapsible) ── */}
      <CollapsibleSection title="FX" open={fxOpen} onToggle={() => setFxOpenPersist(!fxOpen)}>
        {([
          { key: "warmth" as const, label: "Wrm", max: 100, unit: "%" },
          { key: "presence" as const, label: "Pre", min: -12, max: 12, step: 0.5, unit: "dB" },
          { key: "reverbWet" as const, label: "Rev", max: 100, unit: "%" },
          { key: "delayWet" as const, label: "Dly", max: 100, unit: "%" },
          { key: "compThreshold" as const, label: "Thr", min: -60, max: 0, unit: "dB" },
          { key: "compRatio" as const, label: "Rat", min: 1, max: 20, step: 0.5, unit: ":1" },
          { key: "compAttackMs" as const, label: "Atk", min: 1, max: 200, unit: "ms" },
          { key: "compReleaseMs" as const, label: "Rel", min: 10, max: 1000, step: 10, unit: "ms" },
        ]).map(({ key, label, min = 0, max, step = 1, unit }) => (
          <div key={key} className="flex items-center gap-xs">
            <span className="w-6 text-[9px] text-muted-foreground shrink-0">{label}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={mixer[key]}
              disabled={!audioReady}
              onChange={(e) => updateMixer({ [key]: Number(e.target.value) })}
              onDoubleClick={() =>
                updateMixer({
                  [key]:
                    key === "compRatio"
                      ? 1
                      : key === "compAttackMs"
                        ? 10
                        : key === "compReleaseMs"
                          ? 100
                          : 0,
                })
              }
              className="stem-accent-slider min-w-0 flex-1"
              aria-label={`${stem.label} ${label}`}
            />
            <span className="w-8 text-right font-mono text-[8px] text-muted-foreground tabular-nums shrink-0">
              {key === "compRatio"
                ? `${mixer[key].toFixed(1)}`
                : `${mixer[key]}`}
              <span className="text-muted-foreground">{unit}</span>
            </span>
          </div>
        ))}
      </CollapsibleSection>

      {/* ── Pan ── */}
      <div
        className="flex flex-col items-center gap-2xs border-t border-border px-sm py-xs"
        role="group"
        aria-label={`${stem.label} pan`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="self-start text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Pan
        </span>
        <PanKnob
          value={mixer.pan}
          disabled={!audioReady}
          color={stem.glow}
          ariaLabel={`${stem.label} pan`}
          onChange={(pan) => updateMixer({ pan })}
        />
      </div>

      {/* ── Width ── */}
      <ControlSection label="Width" value={`${mixer.width}%`}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={mixer.width}
          disabled={!audioReady}
          onChange={(e) => updateMixer({ width: Number(e.target.value) })}
          onDoubleClick={() => updateMixer({ width: 100 })}
          className="stem-accent-slider w-full"
          aria-label={`${stem.label} stereo width`}
        />
      </ControlSection>

      {/* ── Mute / Solo / Preview (above fader) ── */}
      <div className="flex items-center justify-center gap-xs border-t border-border px-xs py-xs">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStemStateChange(stem.id, { muted: !muted });
          }}
          disabled={!audioReady}
          aria-label={muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
          aria-pressed={muted}
          className={channelMuteSoloButtonClass(muted, "mute", "compact")}
        >
          M
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStemStateChange(stem.id, { soloed: !soloed });
          }}
          disabled={!audioReady}
          aria-label={soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
          aria-pressed={soloed}
          className={channelMuteSoloButtonClass(soloed, "solo", "compact")}
        >
          S
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreviewStem(stem.id);
          }}
          disabled={!audioReady || isLoadingPreview}
          aria-label={isPreviewPlaying ? `Stop ${stem.label}` : `Preview ${stem.label}`}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded text-[10px] font-bold transition ring-1 ring-transparent",
            isPreviewPlaying
              ? "bg-primary-500/20 text-primary-200"
              : "bg-muted text-muted-foreground hover:bg-muted hover:text-secondary-foreground",
          )}
        >
          {isLoadingPreview ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-border border-t-white" />
          ) : (
            <Headphones className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* ── Volume Fader + Meter ── */}
      <div className="flex flex-col items-center gap-2xs border-t border-border px-sm py-sm">
        <MixerSectionLabel className="tracking-[0.15em]">Vol</MixerSectionLabel>
        <div className="flex items-center justify-center gap-2xs">
          {getStemAnalyserData && (
            <ChannelMeter
              getAnalyserData={meterGetter}
              color={stem.glow}
              isPlaying={isMeterPlaying}
              height={120}
            />
          )}
          <MixerVerticalFader
            value={mixer.gain}
            disabled={!audioReady}
            height={120}
            accentColor={stem.glow}
            ariaLabel={`${stem.label} volume`}
            muted={muted}
            onChange={(gain) => updateMixer({ gain })}
            onReset={() => updateMixer({ gain: 0 })}
          />
        </div>
        <EditableDbValue
          value={mixer.gain}
          muted={muted}
          stemLabel={stem.label}
          disabled={!audioReady}
          onChange={(gain) => updateMixer({ gain })}
        />
      </div>
    </div>
  );
});

function ControlSection({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2xs border-t border-border px-sm py-xs">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
          {value}
        </span>
      </div>
      {children}
    </div>
  );
}

function CollapsibleSection({
  title,
  collapsedLabel,
  open,
  onToggle,
  children,
}: {
  title: string;
  collapsedLabel?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-xs px-sm py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-muted-foreground transition"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>{open ? title : (collapsedLabel ?? title)}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-xs px-sm pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
