/**
 * DjMixerConsole — Bottom mixer panel with vertical channel strips.
 * Renders only the tools the user has configured as visible.
 */
import { memo, useCallback } from "react";
import type { StemDefinition } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { defaultStemState } from "../../stem-editor-state";
import { cn } from "../../utils/cn";
import type { DjToolSlot } from "../../hooks/useDjToolbarConfig";

interface DjMixerConsoleProps {
  stems: StemDefinition[];
  stemStates: Record<string, StemEditorState>;
  activeStemId: string;
  playbackReady: boolean;
  visibleTools: DjToolSlot[];
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onActiveStemChange: (stemId: string) => void;
}

const EQ_BANDS = [
  { key: "eqHigh" as const, label: "High" },
  { key: "eqMid" as const, label: "Mid" },
  { key: "eqLow" as const, label: "Low" },
] as const;

export const DjMixerConsole = memo(function DjMixerConsole({
  stems,
  stemStates,
  activeStemId,
  playbackReady,
  visibleTools,
  onStemStateChange,
  onActiveStemChange,
}: DjMixerConsoleProps) {
  if (stems.length === 0) return null;

  const showFaders = visibleTools.some((t) => t.id === "faders");
  const showEq = visibleTools.some((t) => t.id === "eq");
  const showPan = visibleTools.some((t) => t.id === "pan");

  return (
    <div
      className="dj-mixer-console flex gap-0.5 overflow-x-auto px-3 py-3 bg-gradient-to-t from-black/90 to-black/60"
      role="region"
      aria-label="DJ mixer console"
    >
      {stems.map((stem) => {
        const state = stemStates[stem.id] ?? defaultStemState();
        const isActive = stem.id === activeStemId;

        return (
          <DjChannelStrip
            key={stem.id}
            stem={stem}
            state={state}
            isActive={isActive}
            playbackReady={playbackReady}
            showFaders={showFaders}
            showEq={showEq}
            showPan={showPan}
            onStemStateChange={onStemStateChange}
            onActiveStemChange={onActiveStemChange}
          />
        );
      })}
    </div>
  );
});

// ─── Individual Channel Strip (extracted for memoization) ────────────────────

interface DjChannelStripProps {
  stem: StemDefinition;
  state: StemEditorState;
  isActive: boolean;
  playbackReady: boolean;
  showFaders: boolean;
  showEq: boolean;
  showPan: boolean;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onActiveStemChange: (stemId: string) => void;
}

const DjChannelStrip = memo(function DjChannelStrip({
  stem,
  state,
  isActive,
  playbackReady,
  showFaders,
  showEq,
  showPan,
  onStemStateChange,
  onActiveStemChange,
}: DjChannelStripProps) {
  const handleActivate = useCallback(() => {
    onActiveStemChange(stem.id);
  }, [onActiveStemChange, stem.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActiveStemChange(stem.id);
      }
    },
    [onActiveStemChange, stem.id],
  );

  return (
    <div
      className={cn(
        "dj-channel-strip flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 min-w-[4.5rem] transition-all",
        isActive
          ? "border-white/20 bg-white/[0.04]"
          : "border-transparent bg-transparent hover:bg-white/[0.02]",
      )}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${stem.label} channel`}
      aria-pressed={isActive}
    >
      {/* Stem label + color dot */}
      <div className="flex items-center gap-1.5 w-full">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: stem.glow, boxShadow: `0 0 6px ${stem.glow}` }}
          aria-hidden
        />
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/70 truncate">
          {stem.label}
        </span>
      </div>

      {/* EQ knobs (3-band) */}
      {showEq && (
        <div className="flex gap-1 w-full">
          {EQ_BANDS.map(({ key, label }) => (
            <input
              key={key}
              type="range"
              min={-12}
              max={12}
              step={1}
              value={state.mixer[key]}
              disabled={!playbackReady}
              onChange={(e) =>
                onStemStateChange(stem.id, {
                  mixer: { ...state.mixer, [key]: Number(e.target.value) },
                })
              }
              onDoubleClick={() =>
                onStemStateChange(stem.id, {
                  mixer: { ...state.mixer, [key]: 0 },
                })
              }
              className="dj-knob-slider w-full h-1 accent-white/60"
              aria-label={`${stem.label} ${label} EQ`}
            />
          ))}
        </div>
      )}

      {/* Pan */}
      {showPan && (
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={state.mixer.pan}
          disabled={!playbackReady}
          onChange={(e) =>
            onStemStateChange(stem.id, {
              mixer: { ...state.mixer, pan: Number(e.target.value) },
            })
          }
          onDoubleClick={() =>
            onStemStateChange(stem.id, {
              mixer: { ...state.mixer, pan: 0 },
            })
          }
          className="w-full h-1 accent-white/50"
          aria-label={`${stem.label} pan`}
        />
      )}

      {/* Volume fader (vertical) */}
      {showFaders && (
        <div className="flex flex-col items-center gap-0.5 flex-1">
          <input
            type="range"
            min={-20}
            max={6}
            step={0.5}
            value={state.mixer.gain}
            disabled={!playbackReady}
            onChange={(e) =>
              onStemStateChange(stem.id, {
                mixer: { ...state.mixer, gain: Number(e.target.value) },
              })
            }
            onDoubleClick={() =>
              onStemStateChange(stem.id, {
                mixer: { ...state.mixer, gain: 0 },
              })
            }
            className="dj-fader h-20 w-5 accent-white/70"
            style={{ WebkitAppearance: "slider-vertical", writingMode: "vertical-lr", direction: "rtl" } as React.CSSProperties}
            aria-label={`${stem.label} volume`}
            aria-valuetext={`${state.mixer.gain > 0 ? "+" : ""}${state.mixer.gain.toFixed(1)} dB`}
          />
          <span className="font-mono text-[8px] text-white/40 tabular-nums" aria-hidden>
            {state.mixer.gain > 0 ? "+" : ""}{state.mixer.gain.toFixed(1)}
          </span>
        </div>
      )}

      {/* Mute / Solo */}
      <div className="flex gap-1 w-full">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStemStateChange(stem.id, { muted: !state.muted });
          }}
          disabled={!playbackReady}
          className={cn(
            "flex-1 rounded text-[8px] font-bold py-0.5 transition",
            state.muted
              ? "bg-red-500/70 text-white shadow-[0_0_8px_rgba(239,68,68,0.4)]"
              : "bg-white/10 text-white/50 hover:bg-white/15",
          )}
          aria-label={state.muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
          aria-pressed={state.muted}
        >
          M
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStemStateChange(stem.id, { soloed: !state.soloed });
          }}
          disabled={!playbackReady}
          className={cn(
            "flex-1 rounded text-[8px] font-bold py-0.5 transition",
            state.soloed
              ? "bg-amber-500/70 text-white shadow-[0_0_8px_rgba(245,158,11,0.4)]"
              : "bg-white/10 text-white/50 hover:bg-white/15",
          )}
          aria-label={state.soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
          aria-pressed={state.soloed}
        >
          S
        </button>
      </div>
    </div>
  );
});
