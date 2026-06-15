import type { MidiEffectEvent, NoteRepeaterConfig } from "./types";

export class MidiNoteRepeater {
  constructor(
    private config: NoteRepeaterConfig,
    private bpm = 120,
  ) {}

  updateConfig(config: Partial<NoteRepeaterConfig>) {
    this.config = { ...this.config, ...config };
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
  }

  process(events: MidiEffectEvent[]): MidiEffectEvent[] {
    if (!this.config.enabled || this.config.repeats <= 1) return events;

    const result: MidiEffectEvent[] = [];
    const beatDuration = 60 / this.bpm;
    const repeatInterval = beatDuration / this.config.rate;

    for (const event of events) {
      result.push(event);

      for (let i = 1; i < this.config.repeats; i++) {
        const velocityMultiplier = Math.pow(1 - this.config.velocityDecay, i);
        const newVelocity = Math.max(
          1,
          Math.round(event.velocity * velocityMultiplier),
        );
        const pitchShift = this.config.pitchOffset * i;

        result.push({
          pitch: Math.max(0, Math.min(127, event.pitch + pitchShift)),
          velocity: newVelocity,
          start: event.start + repeatInterval * i,
          duration: event.duration,
        });
      }
    }

    return result;
  }
}
