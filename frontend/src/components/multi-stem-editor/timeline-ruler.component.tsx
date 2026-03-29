interface TimelineRulerProps {
  ticks: Array<{ pct: number; time: number }>;
  formatTime: (seconds: number) => string;
}

export function TimelineRuler({ ticks, formatTime }: TimelineRulerProps) {
  return (
    <div className="relative h-5 border-b border-white/10">
      {ticks.map(({ pct, time }) => (
        <div key={pct} className="absolute top-0 flex flex-col items-center" style={{ left: `${pct}%` }}>
          <div className="h-2 w-px bg-white/20" />
          <span className="text-[9px] text-white/40">{formatTime(time)}</span>
        </div>
      ))}
    </div>
  );
}
