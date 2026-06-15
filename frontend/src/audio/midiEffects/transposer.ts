import type { MidiEffectEvent, TransposerConfig } from "./types";

export class MidiTransposer {
  constructor(private config: TransposerConfig) {}

  updateConfig(config: Partial<TransposerConfig>) {
    this.config = { ...this.config, ...config };
  }

  process(events: MidiEffectEvent[]): MidiEffectEvent[] {
    const totalShift = this.config.semitones + this.config.octaves * 12;
    if (totalShift === 0) return events;

    return events.map((event) => ({
      ...event,
      pitch: Math.max(0, Math.min(127, event.pitch + totalShift)),
    }));
  }
}
