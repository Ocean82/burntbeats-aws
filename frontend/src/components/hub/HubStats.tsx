export interface HubStatsProps {
  songsSplit: number;
  finished?: number;
  beatsCreated?: number;
  midiConverted?: number;
}

export function HubStats({
  songsSplit,
  finished,
  beatsCreated,
  midiConverted,
}: HubStatsProps) {
  const items = [
    { label: "Songs split", value: songsSplit, accent: "text-primary-500" },
    ...(finished !== undefined
      ? [{ label: "Finished", value: finished, accent: "text-ice-500" }]
      : []),
    ...(beatsCreated !== undefined
      ? [{ label: "Beats created", value: beatsCreated, accent: "text-accent-midi" }]
      : []),
    ...(midiConverted !== undefined
      ? [{ label: "Notes converted", value: midiConverted, accent: "text-success-500" }]
      : []),
  ];

  return (
    <div className="flex gap-6 md:gap-8">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className={`text-3xl font-bold tabular-nums ${item.accent}`}>{item.value}</div>
          <div className="text-sm text-muted-foreground mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
