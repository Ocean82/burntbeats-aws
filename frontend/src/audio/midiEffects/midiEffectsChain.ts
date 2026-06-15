import { MidiArpeggiator } from "./arpeggiator";
import { MidiChordGenerator } from "./chordGenerator";
import { MidiNoteRepeater } from "./noteRepeater";
import { MidiQuantizer } from "./quantizer";
import { MidiTransposer } from "./transposer";
import type { MidiEffectEvent, MidiEffectsConfig } from "./types";

export class MidiEffectsChain {
  private transposer: MidiTransposer;
  private quantizer: MidiQuantizer;
  private chordGenerator: MidiChordGenerator;
  private noteRepeater: MidiNoteRepeater;
  private arpeggiator: MidiArpeggiator;

  constructor(
    private config: MidiEffectsConfig,
    bpm = 120,
  ) {
    this.transposer = new MidiTransposer(config.transposer);
    this.quantizer = new MidiQuantizer(config.quantizer);
    this.chordGenerator = new MidiChordGenerator(config.chordGenerator);
    this.noteRepeater = new MidiNoteRepeater(config.noteRepeater, bpm);
    this.arpeggiator = new MidiArpeggiator(config.arpeggiator, bpm);
  }

  updateConfig(config: Partial<MidiEffectsConfig>) {
    this.config = { ...this.config, ...config };

    if (config.transposer) this.transposer.updateConfig(config.transposer);
    if (config.quantizer) this.quantizer.updateConfig(config.quantizer);
    if (config.chordGenerator) {
      this.chordGenerator.updateConfig(config.chordGenerator);
    }
    if (config.noteRepeater) this.noteRepeater.updateConfig(config.noteRepeater);
    if (config.arpeggiator) this.arpeggiator.updateConfig(config.arpeggiator);
  }

  setBpm(bpm: number) {
    this.noteRepeater.setBpm(bpm);
    this.arpeggiator.setBpm(bpm);
  }

  getConfig(): MidiEffectsConfig {
    return this.config;
  }

  process(events: MidiEffectEvent[]): MidiEffectEvent[] {
    let processed = events;
    processed = this.transposer.process(processed);
    processed = this.quantizer.process(processed);
    processed = this.chordGenerator.process(processed);
    processed = this.noteRepeater.process(processed);
    processed = this.arpeggiator.process(processed);
    return processed;
  }
}
