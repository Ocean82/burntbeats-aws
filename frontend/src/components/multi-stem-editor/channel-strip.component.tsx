/**
 * ChannelStrip — A single vertical mixer channel for one stem.
 *
 * Signal flow (top → bottom):
 *   Stem label → Pitch → Tempo → EQ (collapsible) → FX (collapsible)
 *   → Pan knob → Volume fader + meter → Mute / Solo
 *
 * Follows standard DAW mixer conventions for muscle memory and quick scanning.
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

// ─── Helpers ─────────────────────────────────────────────────────

function formatDb(value: number): string {
  if (value >= 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
}

function formatPan(value: number): string {
  if (value === 0) return "C";
  if (value < 0) return `L${Math.abs(value)}`;
  return `R${value}`;
}

// ─── Props ───────────────────────────────────────────────────────

export interface ChannelStripProps {
  stem: StemDefinition;
  state: StemEditorState;
  isActive: boolean;
  audioReady: boolean;
  isPreviewPlaying: boolean;
  isLoadingPreview: boolean;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onPreviewStem: (stemId: string) => void;
  onActivate: (stemId: string) => void;
}

// ─── Component ───────────────────────────────────────────────────

export const ChannelStrip = memo(function ChannelStrip({
  stem,
  state,
  isActive,
  audioReady,
  isPreviewPlaying,
  isLoadingPreview,
  onStemStateChange,
  onPreviewStem,
  onActivate,
}: ChannelStripProps) {
  const { mixer, muted, soloed } = state;
  const [eqOpen, setEqOpen] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);

  const updateMixer = useCallback(
    (patch: Partial<typeof mixer>) =>
      onStemStateChange(stem.id, { mixer: { ...mixer, ...patch } }),
    [mixer, onStemStateChange, stem.id],
  );

  return (
    <div
      className={cn(
        "flex w-[140px] min-w-[140px] flex-col items-stretch gap-0 rounded-xl border bg-black/40 transition-all duration-150",
        isActive
          ? "border-current shadow-[0_0_12px_rgba(255,255,255,0.06)]"
          : "border-white/8 hover:border-white/15",
      )}
      style={isActive ? { borderColor: stem.glow } : undefined}
      onClick={() => onActivate(stem.id)}
      role="group"
      aria-label={`${stem.label} channel strip`}
    >
      {/* ── Stem Label ── */}
      <div
        className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5"
        style={{ background: `${stem.glow}08` }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{
            backgroundColor: stem.glow,
            boxShadow: isActive ? `0 0 8px ${stem.glow}` : "none",
          }}
        />
        <span className="text-xs font-semibold truncate text-white/90">
          {stem.label}
        </span>
      </div>

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
      <CollapsibleSection title="EQ" open={eqOpen} onToggle={() => setEqOpen(!eqOpen)}>
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
      <CollapsibleSection title="FX" open={fxOpen} onToggle={() => setFxOpen(!fxOpen)}>
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
      <ControlSection label="Pan" value={formatPan(mixer.pan)}>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={mixer.pan}
          disabled={!audioReady}
          onChange={(e) => updateMixer({ pan: Number(e.target.value) })}
          onDoubleClick={() => updateMixer({ pan: 0 })}
          className="stem-accent-slider w-full"
          aria-label={`${stem.label} pan`}
        />
      </ControlSection>

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

      {/* ── Volume Fader ── */}
      <div className="flex flex-col items-center gap-1 border-t border-white/8 px-3 py-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/35">
          Vol
        </span>
        <div className="relative flex items-center justify-center">
          <input
            type="range"
            min={-20}
            max={6}
            step={0.5}
            value={mixer.gain}
            disabled={!audioReady}
            onChange={(e) => updateMixer({ gain: Number(e.target.value) })}
            onDoubleClick={() => updateMixer({ gain: 0 })}
            aria-label={`${stem.label} volume`}
            aria-valuetext={`${formatDb(mixer.gain)} dB`}
            className={cn(
              "h-[80px] w-5 cursor-pointer accent-amber-500",
              muted && "opacity-40",
            )}
            style={
              {
                WebkitAppearance: "slider-vertical",
                writingMode: "vertical-lr",
                direction: "rtl",
              } as React.CSSProperties
            }
          />
        </div>
        <span
          className={cn(
            "font-mono text-[9px] font-semibold tabular-nums",
            muted ? "text-red-400" : mixer.gain > 3 ? "text-amber-300" : "text-white/50",
          )}
        >
          {muted ? "MUTE" : `${formatDb(mixer.gain)} dB`}
        </span>
      </div>

      {/* ── Mute / Solo / Preview ── */}
      <div className="flex items-center justify-center gap-1.5 border-t border-white/8 px-2 py-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStemStateChange(stem.id, { muted: !muted });
          }}
          disabled={!audioReady}
          aria-label={muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold transition",
            muted
              ? "bg-red-500/25 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
              : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70",
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
          disabled={!audioReady}
          aria-label={soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold transition",
            soloed
              ? "bg-amber-500/30 text-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.3)]"
              : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70",
          )}
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
            "flex h-7 w-7 items-center justify-center rounded transition",
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
    </div>
  );
});

// ─── Sub-components ──────────────────────────────────────────────

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
  open,
  onToggle,
  children,
}: {
  title: string;
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
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35 hover:text-white/50 transition"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-3 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
