import { trimToSeconds, normalizeAudioBuffer, audioBufferToWav } from '../utils/audio';
import type { TrimState, MixerState } from '../types';
import { defaultTrim, defaultMixer } from '../types';

interface ExportMessage {
  type: 'export';
  stems: Array<{ id: string; buffer: ArrayBuffer; sampleRate: number; length: number; numberOfChannels: number }>;
  mutedStems: Record<string, boolean>;
  soloStems: Record<string, boolean>;
  trimMap: Record<string, TrimState>;
  mixerState: Record<string, MixerState>;
  normalize: boolean;
}

interface ExportResult {
  type: 'result';
  blob: ArrayBuffer;
}

interface ExportProgress {
  type: 'progress';
  progress: number;
}

self.onmessage = async (event: MessageEvent<ExportMessage>) => {
  const { type, stems, mutedStems, soloStems, trimMap, mixerState, normalize } = event.data;

  if (type !== 'export') return;

  try {
    self.postMessage({ type: 'progress', progress: 10 } as ExportProgress);

    const hasSolo = Object.values(soloStems).some(v => v);
    const stemsToMix = hasSolo
      ? stems.filter(s => soloStems[s.id])
      : stems.filter(s => !mutedStems[s.id]);

    let maxDuration = 0;
    const sources: {
      buffer: AudioBuffer;
      gain: number;
      pan: number;
      trimStart: number;
      trimEnd: number;
    }[] = [];

    for (const stem of stemsToMix) {
      const audioBuffer = new AudioBuffer({
        length: stem.length,
        numberOfChannels: stem.numberOfChannels,
        sampleRate: stem.sampleRate,
      });

      const channelData = new Float32Array(stem.buffer);
      for (let ch = 0; ch < stem.numberOfChannels; ch++) {
        const offset = ch * stem.length;
        const view = channelData.subarray(offset, offset + stem.length);
        audioBuffer.copyToChannel(view, ch);
      }

      const trim = trimMap[stem.id] ?? defaultTrim;
      const mixer = mixerState[stem.id] ?? defaultMixer;
      const { trimStart, trimEnd } = trimToSeconds(audioBuffer, trim);
      const trimmedDuration = trimEnd - trimStart;
      maxDuration = Math.max(maxDuration, trimmedDuration);

      sources.push({
        buffer: audioBuffer,
        gain: Math.pow(10, mixer.gain / 20),
        pan: mixer.pan / 20,
        trimStart,
        trimEnd,
      });
    }

    self.postMessage({ type: 'progress', progress: 30 } as ExportProgress);

    if (maxDuration === 0) {
      throw new Error('No valid stems to export');
    }

    const exactFrameCount = Math.ceil(maxDuration * 44100);
    const offlineContext = new OfflineAudioContext(2, exactFrameCount, 44100);

    for (const { buffer, gain, pan, trimStart, trimEnd } of sources) {
      const source = offlineContext.createBufferSource();
      const gainNode = offlineContext.createGain();
      const panNode = offlineContext.createStereoPanner();

      source.buffer = buffer;
      gainNode.gain.value = gain;
      panNode.pan.value = pan;

      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(offlineContext.destination);

      const playDuration = trimEnd - trimStart;
      source.start(0, trimStart, playDuration);
    }

    self.postMessage({ type: 'progress', progress: 60 } as ExportProgress);

    let rendered = await offlineContext.startRendering();
    
    self.postMessage({ type: 'progress', progress: 80 } as ExportProgress);

    if (normalize) {
      rendered = normalizeAudioBuffer(rendered);
    }

    const wavBlob = audioBufferToWav(rendered);
    const arrayBuffer = await wavBlob.arrayBuffer();

    self.postMessage({ type: 'progress', progress: 100 } as ExportProgress);
    self.postMessage({ type: 'result', blob: arrayBuffer } as ExportResult);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Export failed',
    });
  }
};

export {};
