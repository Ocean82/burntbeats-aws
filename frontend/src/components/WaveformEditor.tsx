import type { StemDefinition, TrimState } from "../types";

type WaveformEditorProps = {
  stem: StemDefinition;
  trim: TrimState;
  realWaveform?: number[];
};

export function WaveformEditor({ stem, trim, realWaveform }: WaveformEditorProps) {
  const waveform = realWaveform ?? stem.waveform;
  return (
    <div
      className="relative overflow-hidden rounded-[1.5rem] border px-4 py-5"
      style={{
        borderColor: `${stem.glow}40`,
        background: `linear-gradient(180deg, ${stem.glow}08 0%, rgba(0,0,0,0.28) 100%)`,
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: stem.glow, boxShadow: `0 0 8px ${stem.glowSoft}` }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: stem.glow }}>
          {stem.label} · Waveform
        </span>
      </div>
      <div className="pointer-events-none absolute inset-0 top-12 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.11),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-x-4 top-[4.5rem] bottom-5 h-px bg-white/8" />
      <div className="pointer-events-none absolute inset-0 top-12 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:10%_100%]" />

      <div className="relative flex h-28 items-center gap-[5px]">
        {waveform.map((value, index) => (
          <span
            key={`${stem.id}-${index}`}
            className="wave-bar flex-1 rounded-full"
            style={{
              height: `${Math.max(16, value * 100)}%`,
              background: `linear-gradient(180deg, rgba(255,255,255,0.9) 0%, ${stem.glow} 65%, rgba(255,255,255,0.16) 100%)`,
              boxShadow: `0 0 18px ${stem.glowSoft}`,
              opacity: index % 2 === 0 ? 0.9 : 0.58,
            }}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-4 top-14 bottom-5">
        <div
          className="absolute inset-y-0 rounded-[1.2rem] border border-white/18 bg-white/6"
          style={{
            left: `${trim.start}%`,
            right: `${100 - trim.end}%`,
            boxShadow: `inset 0 0 20px ${stem.glowSoft}, 0 0 24px ${stem.glowSoft}`,
          }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-white/70"
          style={{ left: `${trim.start}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-white/70"
          style={{ left: `${trim.end}%` }}
        />
      </div>
    </div>
  );
}
