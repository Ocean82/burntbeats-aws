declare module "soundtouchjs" {
  export class PitchShifter {
    constructor(context: AudioContext, buffer: AudioBuffer, bufferSize: number, startOffset?: number);
    pitch: number;
    tempo: number;
    percentagePlayed: number;
    connect(destination: AudioNode): void;
    disconnect(): void;
    on(event: "play", callback: (detail: { timePlayed: number; formattedTimePlayed: string; percentagePlayed: number }) => void): void;
    off(): void;
  }
}
