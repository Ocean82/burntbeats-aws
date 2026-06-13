declare module "midi-writer-js" {
  interface NoteEventOptions {
    pitch: string | string[] | number;
    velocity?: number;
    startTick?: number;
    duration?: string;
    channel?: number;
  }

  interface ControllerChangeEventOptions {
    controllerNumber: number;
    controllerValue: number;
    delta?: number;
  }

  interface MidiWriterTrack {
    setTempo(bpm: number): void;
    addTrackName(name: string): void;
    addEvent(event: unknown): void;
  }

  interface MidiWriterModule {
    Track: new () => MidiWriterTrack;
    Writer: new (tracks: MidiWriterTrack[]) => { dataUri(): string };
    NoteEvent: new (options: NoteEventOptions) => unknown;
    ControllerChangeEvent: new (options: ControllerChangeEventOptions) => unknown;
  }

  const MidiWriter: MidiWriterModule;

  export default MidiWriter;
}
