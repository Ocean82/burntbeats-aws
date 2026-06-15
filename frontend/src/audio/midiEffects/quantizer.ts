import { isMidiInScale, quantizeToScale } from "../../utils/musicTheory";
import type { MidiEffectEvent, QuantizerConfig } from "./types";

export class MidiQuantizer {
  constructor(private config: QuantizerConfig) {}

  updateConfig(config: Partial<QuantizerConfig>) {
    this.config = { ...this.config, ...config };
  }

  process(events: MidiEffectEvent[]): MidiEffectEvent[] {
    if (!this.config.enabled) return events;

    return events.map((event) => ({
      ...event,
      pitch: this.quantizePitch(event.pitch),
    }));
  }

  quantizePitch(pitch: number): number {
    if (!this.config.enabled) return pitch;

    const quantized = quantizeToScale(
      pitch,
      this.config.root,
      this.config.scale,
    );

    if (this.config.strength < 1) {
      const diff = quantized - pitch;
      return Math.round(pitch + diff * this.config.strength);
    }

    return quantized;
  }

  isPitchInScale(pitch: number): boolean {
    return isMidiInScale(pitch, this.config.root, this.config.scale);
  }
}
