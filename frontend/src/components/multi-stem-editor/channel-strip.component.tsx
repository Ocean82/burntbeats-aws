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
} from "lucide-react";
import type { StemDefinition } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { cn } from "../../utils/cn";
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
        "channel-strip flex w-[120px] min-w-[120px] flex-col items-stretch gap-0 rounded-xl border bg-black/40 transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400/50",
        isActive
          ? "channel-strip--active shadow-[0_0_12px_rgba(255,255,255,0.06)]"
          : "border-white/8 hover:border-white/15",
      )}
      style={{ "--stem-glow": stem.glow } as React.CSSProperties}
    >
      {/* ── Stem Label (click to select) ── */}
      <button
        type="button"
        className="channel-strip__header flex items-center gap-2 border-b border-white/8 px-3 py-2.5 cursor-pointer transition-colors hover:bg-white/[0.04]"
        onClick={() => onActivate(stem.id)}
        aria-label={`Select ${stem.label} channel`}
        aria-pressed={isActive}
      >
        <span
          className={cn(
            "channel-strip__dot h-2.5 w-2.5 rounded-full shrink-0",
            isActive && "channel-strip__dot--active",
          )}
          aria-hidden
        />
        <span className="text-xs font-semibold truncate text-white/90">
          {stem.label}
        </span>
      </button>

      {/* ── Pitch ── */}
      <ControlSection label="Pitch" value={`${state.pitchSemitones > 0 ? "+" : ""}${state.pitchSemitones.toFixed(1)} st`}>
        <input
          type="range"
          min={-3}
          max={3}
          step={0.1}
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
        value={`${Math.round((1 / state.timeStretch - 1) * 100) >= 0 ? "+" : ""}${Math.round((1 / state.timeStretch - 1) * 100)}%`}
      >
        <input
          type="range"
          min={0.85}
          max={1.15}
          step={0.01}
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
          { key: "eqMid" as const, label: "Mid" },
          { key: "eqHigh" as const, label: "Hi" },
        ]).map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-6 text-[9px] text-white/40 shrink-0">{label}</span>
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
            <span className="w-8 text-right font-mono text-[8px] text-white/35 tabular-nums shrink-0">
              {formatDb(mixer[key])}
            </span>
          </div>
        ))}
      </CollapsibleSection>

      {/* ── FX (collapsible) ── */}
      <CollapsibleSection title="FX" open={fxOpen} onToggle={() => setFxOpenPersist(!fxOpen)}>
        {([
          { key: "reverbWet" as const, label: "Rev", max: 100, unit: "%" },
          { key: "delayWet" as const, label: "Dly", max: 100, unit: "%" },
          { key: "compThreshold" as const, label: "Thr", min: -60, max: 0, unit: "dB" },
          { key: "compRatio" as const, label: "Rat", min: 1, max: 20, step: 0.5, unit: ":1" },
        ]).map(({ key, label, min = 0, max, step = 1, unit }) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-6 text-[9px] text-white/40 shrink-0">{label}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={mixer[key]}
              disabled={!audioReady}
              onChange={(e) => updateMixer({ [key]: Number(e.target.value) })}
              onDoubleClick={() =>
                updateMixer({ [key]: key === "compRatio" ? 1 : 0 })
              }
              className="stem-accent-slider min-w-0 flex-1"
              aria-label={`${stem.label} ${label}`}
            />
            <span className="w-8 text-right font-mono text-[8px] text-white/35 tabular-nums shrink-0">
              {key === "compRatio"
                ? `${mixer[key].toFixed(1)}`
                : `${mixer[key]}`}
              <span className="text-white/20">{unit}</span>
            </span>
          </div>
        ))}
      </CollapsibleSection>

      {/* ── Pan ── */}
      <div
        className="flex flex-col items-center gap-1 border-t border-white/5 px-3 py-2"
        role="group"
        aria-label={`${stem.label} pan`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="self-start text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">
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
      <div className="flex items-center justify-center gap-1.5 border-t border-white/8 px-2 py-2">
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
              ? "bg-amber-500/20 text-amber-200"
              : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70",
          )}
        >
          {isLoadingPreview ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
          ) : (
            <Headphones className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* ── Volume Fader + Meter ── */}
      <div className="flex flex-col items-center gap-1 border-t border-white/8 px-3 py-3">
        <MixerSectionLabel className="tracking-[0.15em]">Vol</MixerSectionLabel>
        <div className="flex items-center justify-center gap-1">
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
    <div className="flex flex-col gap-1 border-t border-white/5 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">
          {label}
        </span>
        <span className="font-mono text-[9px] tabular-nums text-white/45">
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
    <div className="border-t border-white/5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/45 hover:text-white/60 transition"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>{open ? title : (collapsedLabel ?? title)}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-3 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
