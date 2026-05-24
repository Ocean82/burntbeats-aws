interface TimelineRulerProps {
  ticks: Array<{ pct: number; time: number }>;
  formatTime: (seconds: number) => string;
}

export function TimelineRuler({ ticks, formatTime }: TimelineRulerProps) {
  return (
    <div className="flex h-6 items-start justify-between overflow-hidden border-b border-border px-0.5">
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
          <div className="h-1.5 w-px bg-secondary" />
          <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">{formatTime(time)}</span>
        </div>
        );
      })}
    </div>
  );
}
