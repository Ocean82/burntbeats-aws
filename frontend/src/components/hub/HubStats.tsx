export interface HubStatsProps {
  stemsSeparated: number;
  completed?: number;
  beatsCreated?: number;
  midiConverted?: number;
}

export function HubStats({
  stemsSeparated,
  completed,
  beatsCreated,
  midiConverted,
}: HubStatsProps) {
  const items = [
    { label: "Stems Separated", value: stemsSeparated, accent: "text-primary-500" },
    ...(completed !== undefined ? [{ label: "Completed", value: completed, accent: "text-ice-500" }] : []),
    ...(beatsCreated !== undefined ? [{ label: "Beats Created", value: beatsCreated, accent: "text-accent-midi" }] : []),
    ...(midiConverted !== undefined ? [{ label: "MIDI Converted", value: midiConverted, accent: "text-success-500" }] : []),
  ];

  return (
    <div className="flex gap-6 md:gap-8">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className={`text-3xl font-bold tabular-nums ${item.accent}`}>
            {item.value}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
