interface TimelineRulerProps {
  ticks: Array<{ pct: number; time: number }>;
  formatTime: (seconds: number) => string;
}

export function TimelineRuler({ ticks, formatTime }: TimelineRulerProps) {
  return (
    <div className="flex h-5 items-start justify-between overflow-hidden border-b border-white/10">
      {ticks.map(({ pct, time }, index) => {
        const isFirst = index === 0;
        const isLast = index === ticks.length - 1;
        return (
          <div
            key={pct}
            className={
              isFirst
                ? "flex min-w-0 flex-col items-start"
                : isLast
                  ? "flex min-w-0 flex-col items-end"
                  : "flex min-w-0 flex-col items-center"
            }
          >
          <div className="h-2 w-px bg-white/20" />
          <span className="text-[9px] text-white/40">{formatTime(time)}</span>
        </div>
        );
      })}
    </div>
  );
}
