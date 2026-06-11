/**
 * MasterProcessingPanel — Collapsible 3-band EQ + Compressor controls
 * for the master bus. Dense, studio-hardware feel.
 */
import { useCallback } from "react";
import { Activity, Zap } from "lucide-react";
import { cn } from "../../utils/cn";
import { useMasterProcessingStore } from "../../hooks/audio/useMasterProcessing";
import type { MasterEqState, MasterCompressorState } from "../../types/masterBus";

/* ─── Knob Sub-component ───────────────────────────────────────── */

interface KnobSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function KnobSlider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = "dB",
  onChange,
  disabled = false,
}: KnobSliderProps) {
  return (
    <div className="flex flex-col items-center gap-[2px]">
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground/70 select-none">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="master-knob h-1 w-14 cursor-pointer appearance-none rounded-full bg-white/10 accent-primary-400 disabled:opacity-40 disabled:cursor-not-allowed
          [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-400
          [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary-400 [&::-moz-range-thumb]:border-0"
        aria-label={`${label}: ${value}${unit}`}
      />
      <span className="text-[9px] tabular-nums text-muted-foreground/60">
        {value > 0 ? "+" : ""}{value.toFixed(1)}{unit}
      </span>
    </div>
  );
}

/* ─── Section Toggle ───────────────────────────────────────────── */

interface SectionHeaderProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
}

function SectionHeader({ label, enabled, onToggle, icon }: SectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-xs rounded-lg px-sm py-[3px] text-[10px] font-bold uppercase tracking-wider transition-colors",
        enabled
          ? "bg-primary-500/20 text-primary-200 border border-primary-400/30"
          : "bg-white/[0.03] text-muted-foreground/60 border border-white/[0.06] hover:bg-white/[0.06]",
      )}
      aria-pressed={enabled}
      aria-label={`${label} ${enabled ? "enabled" : "disabled"}`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ─── Main Panel ───────────────────────────────────────────────── */

export interface MasterProcessingPanelProps {
  onEqChange?: (eq: MasterEqState) => void;
  onCompressorChange?: (comp: MasterCompressorState) => void;
  className?: string;
}

export function MasterProcessingPanel({
  onEqChange,
  onCompressorChange,
  className,
}: MasterProcessingPanelProps) {
  const { eq, compressor, setEq, setCompressor } = useMasterProcessingStore();

  const handleEqChange = useCallback(
    (key: keyof MasterEqState, value: number | boolean) => {
      const next = { ...eq, [key]: value };
      setEq({ [key]: value });
      onEqChange?.(next);
    },
    [eq, setEq, onEqChange],
  );

  const handleCompChange = useCallback(
    (key: keyof MasterCompressorState, value: number | boolean) => {
      const next = { ...compressor, [key]: value };
      setCompressor({ [key]: value });
      onCompressorChange?.(next);
    },
    [compressor, setCompressor, onCompressorChange],
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-md rounded-xl border border-white/[0.06] bg-white/[0.02] px-md py-sm",
        className,
      )}
      role="group"
      aria-label="Master processing controls"
    >
      {/* ── EQ Section ── */}
      <div className="flex items-center gap-sm">
        <SectionHeader
          label="EQ"
          enabled={eq.enabled}
          onToggle={() => handleEqChange("enabled", !eq.enabled)}
          icon={<Activity className="h-3 w-3" />}
        />
        <div className="flex items-center gap-xs">
          <KnobSlider
            label="Low"
            value={eq.lowGain}
            min={-12}
            max={12}
            step={0.5}
            onChange={(v) => handleEqChange("lowGain", v)}
            disabled={!eq.enabled}
          />
          <KnobSlider
            label="Mid"
            value={eq.midGain}
            min={-12}
            max={12}
            step={0.5}
            onChange={(v) => handleEqChange("midGain", v)}
            disabled={!eq.enabled}
          />
          <KnobSlider
            label="High"
            value={eq.highGain}
            min={-12}
            max={12}
            step={0.5}
            onChange={(v) => handleEqChange("highGain", v)}
            disabled={!eq.enabled}
          />
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="h-8 w-px bg-white/[0.08]" aria-hidden />

      {/* ── Compressor Section ── */}
      <div className="flex items-center gap-sm">
        <SectionHeader
          label="Comp"
          enabled={compressor.enabled}
          onToggle={() => handleCompChange("enabled", !compressor.enabled)}
          icon={<Zap className="h-3 w-3" />}
        />
        <div className="flex items-center gap-xs">
          <KnobSlider
            label="Thresh"
            value={compressor.threshold}
            min={-60}
            max={0}
            step={1}
            onChange={(v) => handleCompChange("threshold", v)}
            disabled={!compressor.enabled}
          />
          <KnobSlider
            label="Ratio"
            value={compressor.ratio}
            min={1}
            max={20}
            step={0.5}
            unit=":1"
            onChange={(v) => handleCompChange("ratio", v)}
            disabled={!compressor.enabled}
          />
          <KnobSlider
            label="Atk"
            value={compressor.attack * 1000}
            min={1}
            max={200}
            step={1}
            unit="ms"
            onChange={(v) => handleCompChange("attack", v / 1000)}
            disabled={!compressor.enabled}
          />
          <KnobSlider
            label="Rel"
            value={compressor.release * 1000}
            min={10}
            max={1000}
            step={10}
            unit="ms"
            onChange={(v) => handleCompChange("release", v / 1000)}
            disabled={!compressor.enabled}
          />
        </div>
      </div>
    </div>
  );
}
