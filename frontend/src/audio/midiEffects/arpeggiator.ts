import type { ArpeggiatorConfig, MidiEffectEvent } from "./types";

export class MidiArpeggiator {
  constructor(
    private config: ArpeggiatorConfig,
    private bpm = 120,
  ) {}

  updateConfig(config: Partial<ArpeggiatorConfig>) {
    this.config = { ...this.config, ...config };
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
  }

  private generatePattern(pitches: number[]): number[] {
    if (pitches.length === 0) return [];

    let expanded: number[] = [];
    for (let octave = 0; octave < this.config.octaves; octave++) {
      expanded.push(...pitches.map((n) => n + octave * 12));
    }

    switch (this.config.pattern) {
      case "up":
        return expanded;
      case "down":
        return [...expanded].reverse();
      case "updown":
        return [...expanded, ...expanded.slice(1, -1).reverse()];
      case "downup": {
        const down = [...expanded].reverse();
        return [...down, ...down.slice(1, -1).reverse()];
      }
      case "random":
        return [...expanded].sort(() => Math.random() - 0.5);
      case "chord":
      case "played":
        return pitches;
      default:
        return expanded;
    }
  }

  private getStepInterval(): number {
    const beatDuration = 60 / this.bpm;
    return beatDuration / this.config.rate;
  }

  private getNoteDuration(): number {
    return this.getStepInterval() * this.config.gateLength;
  }

  process(events: MidiEffectEvent[]): MidiEffectEvent[] {
    if (!this.config.enabled) return events;

    const chordGroups = new Map<number, MidiEffectEvent[]>();

    for (const event of events) {
      const timeKey = Math.round(event.start * 1000);
      const group = chordGroups.get(timeKey) ?? [];
      group.push(event);
      chordGroups.set(timeKey, group);
    }

    const result: MidiEffectEvent[] = [];
    const stepInterval = this.getStepInterval();
    const noteDuration = this.getNoteDuration();

    for (const [startKey, chordEvents] of chordGroups) {
      const startTime = startKey / 1000;

      if (chordEvents.length === 1 && this.config.pattern !== "chord") {
        const pattern = this.generatePattern([chordEvents[0].pitch]);
        pattern.forEach((pitch, index) => {
          result.push({
            pitch,
            velocity: chordEvents[0].velocity,
            start: startTime + index * stepInterval,
            duration: noteDuration,
          });
        });
      } else {
        const pitches = chordEvents.map((e) => e.pitch).sort((a, b) => a - b);
        const pattern = this.generatePattern(pitches);
        const avgVelocity = Math.round(
          chordEvents.reduce((sum, e) => sum + e.velocity, 0) /
            chordEvents.length,
        );

        if (this.config.pattern === "chord") {
          result.push(...chordEvents);
        } else {
          pattern.forEach((pitch, index) => {
            result.push({
              pitch,
              velocity: avgVelocity,
              start: startTime + index * stepInterval,
              duration: noteDuration,
            });
          });
        }
      }
    }

    return result.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  }
}
