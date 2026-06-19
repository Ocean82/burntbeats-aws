import { useCallback } from "react";
import { useAppStore } from "../../store/appStore";
import { cn } from "../../utils/cn";

const BPM_MIN = 40;
const BPM_MAX = 300;
const PITCH_MIN = -12;
const PITCH_MAX = 12;

const COUNT_IN_OPTIONS = [
  { value: "off" as const, label: "Off" },
  { value: "1bar" as const, label: "1 bar" },
  { value: "2bars" as const, label: "2 bars" },
  { value: "4bars" as const, label: "4 bars" },
];

export function ConfigureGlobalControls() {
  const globalBpm = useAppStore((s) => s.globalBpm);
  const globalPitchSemitones = useAppStore((s) => s.globalPitchSemitones);
  const metronomeEnabled = useAppStore((s) => s.metronomeEnabled);
  const countIn = useAppStore((s) => s.countIn);
  const setGlobalBpm = useAppStore((s) => s.setGlobalBpm);
  const setGlobalPitchSemitones = useAppStore((s) => s.setGlobalPitchSemitones);
  const setMetronomeEnabled = useAppStore((s) => s.setMetronomeEnabled);
  const setCountIn = useAppStore((s) => s.setCountIn);

  const handleBpmInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseInt(e.target.value, 10);
      if (!isNaN(raw)) setGlobalBpm(raw);
    },
    [setGlobalBpm],
  );

  const incPitch = useCallback(() => {
    setGlobalPitchSemitones(Math.min(PITCH_MAX, globalPitchSemitones + 1));
  }, [globalPitchSemitones, setGlobalPitchSemitones]);

  const decPitch = useCallback(() => {
    setGlobalPitchSemitones(Math.max(PITCH_MIN, globalPitchSemitones - 1));
  }, [globalPitchSemitones, setGlobalPitchSemitones]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-lg">
      <h3 className="mb-lg text-sm font-semibold text-foreground">Global</h3>

      <div className="flex flex-wrap gap-x-8 gap-y-lg">
        {/* BPM */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Tempo (BPM)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={BPM_MIN}
              max={BPM_MAX}
              value={globalBpm}
              onChange={(e) => setGlobalBpm(Number(e.target.value))}
              className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-white/15 accent-primary-500 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500"
            />
            <input
              type="number"
              min={BPM_MIN}
              max={BPM_MAX}
              value={globalBpm}
              onChange={handleBpmInput}
              className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-sm tabular-nums text-foreground outline-none transition focus:border-primary-500/50"
            />
          </div>
        </div>

        {/* Pitch */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Pitch (semitones)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={decPitch}
              disabled={globalPitchSemitones <= PITCH_MIN}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-bold text-foreground transition hover:bg-white/10 disabled:opacity-30"
            >
              -1
            </button>
            <span className="flex h-8 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-semibold tabular-nums text-foreground">
              {globalPitchSemitones > 0 ? "+" : ""}
              {globalPitchSemitones}
            </span>
            <button
              type="button"
              onClick={incPitch}
              disabled={globalPitchSemitones >= PITCH_MAX}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-bold text-foreground transition hover:bg-white/10 disabled:opacity-30"
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => setGlobalPitchSemitones(0)}
              disabled={globalPitchSemitones === 0}
              className="ml-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-muted-foreground transition hover:bg-white/5 disabled:opacity-30"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Metronome */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Metronome
          </span>
          <button
            type="button"
            onClick={() => setMetronomeEnabled(!metronomeEnabled)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition",
              metronomeEnabled
                ? "border-primary-500/50 bg-primary-500/15 text-primary-300"
                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
            )}
          >
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                metronomeEnabled ? "bg-primary-400" : "bg-white/20",
              )}
            />
            {metronomeEnabled ? "On" : "Off"}
          </button>
        </div>

        {/* Count-in */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Count-in
          </span>
          <div className="flex gap-1">
            {COUNT_IN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCountIn(opt.value)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  countIn === opt.value
                    ? "border-primary-500/50 bg-primary-500/15 text-primary-300"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
