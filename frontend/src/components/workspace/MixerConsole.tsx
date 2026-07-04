import { useCallback, useMemo } from "react";
import { ChevronDown, ChevronUp, Volume2, Music } from "lucide-react";
import { cn } from "@/utils/cn";
import { LAYOUT } from "@/constants/layout";
import { useWorkspaceLayout } from "@/hooks/useWorkspaceLayout";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { useAudio } from "@/contexts/AudioContext";
import { MasterProcessingPanel } from "@/components/master-processing";
import { mergeMixerState } from "@/types";
import type { StemEditorState } from "@/stem-editor-state";

/* ─── Types ─────────────────────────────────────────────────────── */

export interface MixerConsoleProps {
  className?: string;
}

/* ─── Channel Strip Sub-component ───────────────────────────────── */

interface ChannelStripProps {
  stemId: string;
  label: string;
  stemState: StemEditorState;
  color: string;
  onVolumeChange: (stemId: string, gain: number) => void;
  onPanChange: (stemId: string, pan: number) => void;
  onMuteToggle: (stemId: string) => void;
  onSoloToggle: (stemId: string) => void;
}

function ChannelStrip({
  stemId,
  label,
  stemState,
  color,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
}: ChannelStripProps) {
  const mixer = mergeMixerState(stemState.mixer);

  return (
    <div
      className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] min-w-[72px]"
      data-testid={`channel-strip-${stemId}`}
    >
      {/* Color indicator */}
      <div
        className="w-full h-1 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}40` }}
        aria-hidden
      />

      {/* Label */}
      <span
        className="text-[9px] font-bold uppercase tracking-wider truncate w-full text-center"
        style={{ color }}
      >
        {label}
      </span>

      {/* Fader + Meter row */}
      <div className="flex items-stretch gap-1 w-full justify-center" style={{ height: "80px" }}>
        {/* Level meter (left side) */}
        <div
          className="relative w-[6px] rounded-full bg-white/[0.06] overflow-hidden"
          aria-label={`${label} level meter`}
          role="meter"
          aria-valuemin={-60}
          aria-valuemax={6}
          aria-valuenow={mixer.gain}
        >
          {/* Meter fill — height based on gain mapped to 0-100% */}
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full transition-[height] duration-150"
            style={{
              height: `${Math.max(0, Math.min(100, ((mixer.gain + 20) / 26) * 100))}%`,
              background: mixer.gain > 3
                ? "linear-gradient(to top, #22c55e 0%, #eab308 60%, #ef4444 90%)"
                : mixer.gain > -3
                  ? "linear-gradient(to top, #22c55e 0%, #eab308 85%, #4ade80 100%)"
                  : "linear-gradient(to top, #22c55e 0%, #4ade80 100%)",
            }}
          />
          {/* Unity (0 dB) mark */}
          <div
            className="absolute left-0 right-0 h-px bg-white/30"
            style={{ bottom: `${(20 / 26) * 100}%` }}
            aria-hidden
          />
        </div>

        {/* Volume fader (right side) */}
        <div className="flex flex-col items-center">
          <input
            type="range"
            min={-20}
            max={6}
            step={0.1}
            value={mixer.gain}
            onChange={(e) => onVolumeChange(stemId, Number(e.target.value))}
            onDoubleClick={() => onVolumeChange(stemId, 0)}
            aria-label={`${label} volume`}
            className="channel-fader w-3 cursor-pointer appearance-none rounded-full bg-white/[0.08] [writing-mode:vertical-lr] rotate-180"
            style={{ "--strip-color": color, height: "80px" } as React.CSSProperties}
          />
        </div>
      </div>

      {/* dB readout */}
      <span className="text-[8px] font-mono text-muted-foreground tabular-nums">
        {mixer.gain >= 0 ? "+" : ""}
        {mixer.gain.toFixed(1)} dB
      </span>

      {/* Pan knob */}
      <div className="flex flex-col items-center gap-0.5 w-full">
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={mixer.pan}
          onChange={(e) => onPanChange(stemId, Number(e.target.value))}
          onDoubleClick={() => onPanChange(stemId, 0)}
          aria-label={`${label} pan`}
          className="w-full h-1 appearance-none rounded-full bg-white/20 accent-[color:var(--strip-color)] cursor-pointer"
          style={{ "--strip-color": color } as React.CSSProperties}
        />
        <span className="text-[8px] font-mono text-muted-foreground tabular-nums">
          {mixer.pan === 0 ? "C" : mixer.pan < 0 ? `L${Math.abs(mixer.pan)}` : `R${mixer.pan}`}
        </span>
      </div>

      {/* Mute / Solo buttons */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onMuteToggle(stemId)}
          aria-label={`${stemState.muted ? "Unmute" : "Mute"} ${label}`}
          aria-pressed={stemState.muted}
          className={cn(
            "w-6 h-5 rounded text-[8px] font-bold transition",
             stemState.muted
               ? "bg-red-500/30 text-red-300 border border-red-500/50"
               : "bg-white/5 text-muted-foreground hover:text-white/70 border border-white/10",
          )}
        >
          M
        </button>
        <button
          type="button"
          onClick={() => onSoloToggle(stemId)}
          aria-label={`${stemState.soloed ? "Unsolo" : "Solo"} ${label}`}
          aria-pressed={stemState.soloed}
          className={cn(
            "w-6 h-5 rounded text-[8px] font-bold transition",
             stemState.soloed
               ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
               : "bg-white/5 text-muted-foreground hover:text-white/70 border border-white/10",
          )}
        >
          S
        </button>
      </div>
    </div>
  );
}

/* ─── Master Channel Strip ──────────────────────────────────────── */

interface MasterStripProps {
  stemCount: number;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
}

function MasterStrip({ stemCount, masterVolume, onMasterVolumeChange }: MasterStripProps) {
  // Convert linear gain (0–1.5) to dB for display: dB = 20 * log10(gain)
  // Clamp to avoid -Infinity when gain is 0
  const gainDb = masterVolume > 0 ? 20 * Math.log10(masterVolume) : -60;
  const displayDb = Math.max(-12, Math.min(12, gainDb));

  return (
    <div
      className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-500/[0.05] border border-violet-500/20 min-w-[80px]"
      data-testid="channel-strip-master"
    >
      {/* Master indicator */}
      <div
        className="w-full h-1 rounded-full bg-violet-500"
        aria-hidden
        style={{ boxShadow: "0 0 6px rgba(139,92,246,0.6)" }}
      />

      {/* Label */}
      <div className="flex items-center gap-1">
        <Music className="w-3 h-3 text-violet-400" aria-hidden />
        <span className="text-[9px] font-bold uppercase tracking-wider text-violet-400">
          Master
        </span>
      </div>

      {/* Stem count */}
      <span className="text-[8px] text-muted-foreground">{stemCount} stems</span>

      {/* Volume fader — wired to audio engine master gain */}
      <div className="flex flex-col items-center gap-0.5 w-full">
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={masterVolume}
          onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
          aria-label="Master volume"
          className="w-full h-1 appearance-none rounded-full bg-white/20 accent-violet-500 cursor-pointer [writing-mode:vertical-lr] rotate-180 h-[60px]"
        />
        <span className="text-[8px] font-mono text-muted-foreground tabular-nums">
          {displayDb >= 0 ? "+" : ""}
          {displayDb.toFixed(1)} dB
        </span>
      </div>

      {/* VU indicator */}
      <div className="flex gap-0.5">
        <Volume2 className="w-3 h-3 text-violet-400/60" aria-hidden />
      </div>
    </div>
  );
}

/* ─── Stem Lane Colors (matching WaveformTimeline) ──────────────── */

const STEM_COLORS = [
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#8b5cf6", // Violet
] as const;

/* ─── Main MixerConsole Component ───────────────────────────────── */

/**
 * MixerConsole — Collapsible channel strips at the bottom of the Workspace.
 *
 * Features:
 * - Toggle control in header area to collapse/expand with 300ms animation
 * - When collapsed, WaveformTimeline expands to fill reclaimed space (handled by Workspace grid)
 * - Max height 30% of workspace area below TransportBar
 * - Integrates existing MasterSection logic as master channel strip
 *
 * Requirements: 9.3, 9.6
 */
export function MixerConsole({ className }: MixerConsoleProps) {
  const { mixerExpanded, toggleMixer } = useWorkspaceLayout();
  const reducedMotion = useReducedMotion();
  const { stemStates, setStemStates } = useWorkflow();
  const audio = useAudio();

  const stemIds = useMemo(() => Object.keys(stemStates), [stemStates]);

  const handleVolumeChange = useCallback(
    (stemId: string, gain: number) => {
      setStemStates((prev) => ({
        ...prev,
        [stemId]: {
          ...prev[stemId],
          mixer: { ...mergeMixerState(prev[stemId]?.mixer), gain },
        },
      }));
    },
    [setStemStates],
  );

  const handlePanChange = useCallback(
    (stemId: string, pan: number) => {
      setStemStates((prev) => ({
        ...prev,
        [stemId]: {
          ...prev[stemId],
          mixer: { ...mergeMixerState(prev[stemId]?.mixer), pan },
        },
      }));
    },
    [setStemStates],
  );

  const handleMuteToggle = useCallback(
    (stemId: string) => {
      setStemStates((prev) => ({
        ...prev,
        [stemId]: {
          ...prev[stemId],
          muted: !prev[stemId]?.muted,
        },
      }));
    },
    [setStemStates],
  );

  const handleSoloToggle = useCallback(
    (stemId: string) => {
      setStemStates((prev) => ({
        ...prev,
        [stemId]: {
          ...prev[stemId],
          soloed: !prev[stemId]?.soloed,
        },
      }));
    },
    [setStemStates],
  );

  // Derive stem labels from IDs
  const getStemLabel = (id: string): string => {
    // Capitalize and clean up stem ID for display
    return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const transitionDuration = reducedMotion ? 0 : LAYOUT.TRANSITION_DURATION;

  return (
    <div
      data-testid="mixer-console"
      className={cn(
        "flex flex-col overflow-hidden",
        "border-t border-white/5 bg-[hsl(220,15%,10%)]/75 backdrop-blur-sm",
        className,
      )}
      style={{
        maxHeight: mixerExpanded
          ? `calc((100vh - ${LAYOUT.HEADER_HEIGHT}px - ${LAYOUT.TRANSPORT_HEIGHT}px) * ${LAYOUT.MIXER_MAX_HEIGHT_RATIO})`
          : "0px",
        transition: `max-height ${transitionDuration}ms ease-in-out`,
        borderRadius: `${LAYOUT.PANEL_BORDER_RADIUS}px ${LAYOUT.PANEL_BORDER_RADIUS}px 0 0`,
      }}
      aria-label="Mixer console"
      role="region"
    >
      {/* Header area with toggle control */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06] shrink-0"
        style={{ background: "rgba(139,92,246,0.03)" }}
      >
        <button
          type="button"
          onClick={toggleMixer}
          aria-label={mixerExpanded ? "Collapse mixer" : "Expand mixer"}
          aria-expanded={mixerExpanded}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer",
            "text-muted-foreground hover:text-foreground hover:bg-white/5",
            "transition-colors min-h-[36px]",
          )}
          data-testid="mixer-toggle"
        >
          {mixerExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider">
            Mixer
          </span>
        </button>

        <div className="flex-1" />

        <span className="text-[9px] text-muted-foreground">
          {stemIds.length} channel{stemIds.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Channel strips area */}
      <div className="flex items-stretch gap-2 px-4 py-3 overflow-x-auto flex-1 min-h-0">
        {/* Master processing (EQ + Compressor) */}
        {stemIds.length > 0 && (
          <MasterProcessingPanel className="mb-2 w-full shrink-0" />
        )}

        {/* Per-stem channel strips */}
        <div className="flex items-stretch gap-2 overflow-x-auto flex-1 min-h-0">
          {stemIds.map((stemId, index) => (
            <ChannelStrip
              key={stemId}
              stemId={stemId}
              label={getStemLabel(stemId)}
              stemState={stemStates[stemId]}
              color={STEM_COLORS[index % STEM_COLORS.length]}
              onVolumeChange={handleVolumeChange}
              onPanChange={handlePanChange}
              onMuteToggle={handleMuteToggle}
              onSoloToggle={handleSoloToggle}
            />
          ))}

          {/* Separator */}
          {stemIds.length > 0 && (
            <div className="w-px self-stretch bg-white/10 mx-1" aria-hidden />
          )}

          {/* Master channel strip */}
          <MasterStrip
            stemCount={stemIds.length}
            masterVolume={audio.masterVolume}
            onMasterVolumeChange={audio.setMasterVolume}
          />
        </div>
      </div>
    </div>
  );
}
