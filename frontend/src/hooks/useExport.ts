/**
 * useExport — default **client-side** master WAV (OfflineAudioContext) and per-stem download.
 * Server-side export is optional (`POST /api/stems/server-export`); see docs/ARCHITECTURE-FLOW.md.
 * Master mix stem set matches playback via `filterStemsForAudibleMix`.
 */
import { useCallback, useState } from "react";
import lamejs from "lamejs";
import { serverExportMasterWav } from "../api";
import type { StemResult } from "../types";
import { audioBufferToWav, normalizeAudioBuffer, trimToSeconds, createStereoWidthNode } from "../utils/audio";
import { defaultStemState, getStemEffectiveRate, type StemEditorState } from "../stem-editor-state";
import { filterStemsForAudibleMix } from "../utils/stemAudibility";
import type { ExportOptions } from "../components";

interface UseExportReturn {
  isExporting: boolean;
  exportMasterWav: (
    options: { normalize?: boolean; skipBusy?: boolean } | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    onError: (msg: string) => void
  ) => Promise<void>;
  handleExportWithOptions: (
    options: ExportOptions,
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    onError: (msg: string) => void,
    onClose: () => void,
    serverExportJobId?: string | null,
    serverExportStemIds?: string[]
  ) => Promise<void>;

  /**
   * Manual debugging utility: compare server vs client master export.
   * Useful to quantify "how close" the DSP approximation is.
   */
  compareMasterExportServerAndClient: (params: {
    serverExportJobId: string;
    stemBuffers: Record<string, AudioBuffer>;
    splitResultStems: StemResult[];
    stemStates: Record<string, StemEditorState>;
    uploadName: string;
    normalize: boolean;
    stemIds: string[];
  }) => Promise<ExportCompareMetrics>;
}

export type ExportCompareMetrics = {
  ok: boolean;
  error?: string;
  durationSecServer?: number;
  durationSecClient?: number;
  durationDiffSec?: number;
  rmsServer?: number;
  rmsClient?: number;
  rmsDiff?: number;
  rmsDiffDb?: number; // 20*log10(rmsDiff/rmsClient)
  peakDiff?: number;
};

export function useExport(): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);

  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const encodeWavToMp3 = useCallback((wavBuffer: ArrayBuffer, kbps = 192): Blob => {
    const wavView = new DataView(wavBuffer);
    const riff = String.fromCharCode(
      wavView.getUint8(0),
      wavView.getUint8(1),
      wavView.getUint8(2),
      wavView.getUint8(3)
    );
    if (riff !== "RIFF") throw new Error("Invalid WAV file");

    const numChannels = wavView.getUint16(22, true);
    const sampleRate = wavView.getUint32(24, true);
    const bitsPerSample = wavView.getUint16(34, true);
    if (bitsPerSample !== 16) throw new Error("Only 16-bit WAV is supported for MP3 export");
    if (numChannels !== 1 && numChannels !== 2) throw new Error("Only mono/stereo WAV is supported for MP3 export");

    // Find "data" chunk (do not assume fixed 44-byte PCM header).
    let dataOffset = -1;
    let dataLength = 0;
    let offset = 12;
    while (offset + 8 <= wavBuffer.byteLength) {
      const chunkId = String.fromCharCode(
        wavView.getUint8(offset),
        wavView.getUint8(offset + 1),
        wavView.getUint8(offset + 2),
        wavView.getUint8(offset + 3)
      );
      const chunkSize = wavView.getUint32(offset + 4, true);
      if (chunkId === "data") {
        dataOffset = offset + 8;
        dataLength = chunkSize;
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    if (dataOffset < 0) throw new Error("WAV data chunk not found");

    const sampleCount = dataLength / (bitsPerSample / 8) / numChannels;
    const left = new Int16Array(sampleCount);
    const right = new Int16Array(sampleCount);
    let idx = dataOffset;
    for (let i = 0; i < sampleCount; i++) {
      left[i] = wavView.getInt16(idx, true);
      idx += 2;
      if (numChannels === 2) {
        right[i] = wavView.getInt16(idx, true);
        idx += 2;
      } else {
        right[i] = left[i];
      }
    }

    const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
    const chunkSize = 1152;
    const chunks: ArrayBuffer[] = [];
    for (let i = 0; i < sampleCount; i += chunkSize) {
      const leftChunk = left.subarray(i, i + chunkSize);
      const rightChunk = right.subarray(i, i + chunkSize);
      const frame = encoder.encodeBuffer(leftChunk, rightChunk);
      if (frame.length > 0) {
        const bytes = new Uint8Array(frame);
        chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      }
    }
    const finalFrame = encoder.flush();
    if (finalFrame.length > 0) {
      const bytes = new Uint8Array(finalFrame);
      chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
    return new Blob(chunks, { type: "audio/mpeg" });
  }, []);

  const downloadStemByUrl = useCallback(async (stem: StemResult, baseName: string) => {
    const res = await fetch(stem.url);
    if (!res.ok) throw new Error(`Failed to download stem: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}_${stem.id}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportMasterWavServer = useCallback(async (
    jobId: string,
    stemIds: string[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    normalize: boolean
  ) => {
    const uploadBaseName = uploadName.replace(/\.[^/.]+$/, "");
    const fileName = `${uploadBaseName}_master.wav`;

    const stemStatesSubset: Record<string, StemEditorState> = {};
    for (const id of stemIds) {
      if (stemStates[id]) stemStatesSubset[id] = stemStates[id];
    }

    const blob = await serverExportMasterWav({
      job_id: jobId,
      stem_ids: stemIds,
      stem_states: stemStatesSubset,
      upload_name: uploadName,
      normalize,
    });

    triggerDownload(blob, fileName);
  }, [triggerDownload]);

  const renderClientMasterWavBlob = useCallback(async (
    options: { normalize?: boolean },
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string
  ): Promise<Blob> => {
    const stemsToMix = filterStemsForAudibleMix(splitResultStems, stemStates);

    let maxDuration = 0;
    const sources: { buffer: AudioBuffer; gain: number; pan: number; width: number; rate: number; trimStart: number; trimEnd: number }[] = [];

    for (const stem of stemsToMix) {
      const buffer = stemBuffers[stem.id];
      if (!buffer) continue;
      const st = stemStates[stem.id] ?? defaultStemState();
      const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
      const rate = getStemEffectiveRate(st);
      const wallDuration = (trimEnd - trimStart) / rate;
      maxDuration = Math.max(maxDuration, wallDuration);
      sources.push({
        buffer,
        gain: Math.pow(10, st.mixer.gain / 20),
        pan: st.mixer.pan / 100,
        width: st.mixer.width,
        rate,
        trimStart,
        trimEnd,
      });
    }

    if (maxDuration === 0) throw new Error("No valid stems to export (missing buffers?).");

    const context = new OfflineAudioContext(2, Math.ceil(maxDuration * 44100), 44100);
    for (const { buffer, gain, pan, width, rate, trimStart, trimEnd } of sources) {
      const source = context.createBufferSource();
      const gainNode = context.createGain();
      const panNode = context.createStereoPanner();
      const widthNode = createStereoWidthNode(context);
      source.buffer = buffer;
      source.playbackRate.value = rate;
      gainNode.gain.value = gain;
      panNode.pan.value = pan;
      widthNode.setWidth(width);
      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(widthNode.input);
      widthNode.output.connect(context.destination);
      source.start(0, trimStart, trimEnd - trimStart);
    }

    let rendered = await context.startRendering();
    if (options.normalize) rendered = normalizeAudioBuffer(rendered);
    const wavBlob = audioBufferToWav(rendered);
    // uploadName is only used to mirror existing download naming; not required for Blob contents.
    void uploadName;
    return wavBlob;
  }, []);

  const decodeWavBlobToAudioBuffer = useCallback(async (blob: Blob): Promise<AudioBuffer> => {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("AudioContext not supported in this browser");
    const ctx = new AudioContextCtor();
    try {
      // decodeAudioData signature varies; use a promise wrapper.
      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyCtx: any = ctx;
        if (typeof anyCtx.decodeAudioData === "function") {
          anyCtx.decodeAudioData(arrayBuffer.slice(0), (b: AudioBuffer) => resolve(b), (err: unknown) => reject(err));
        } else {
          reject(new Error("decodeAudioData not available"));
        }
      });
      return audioBuffer;
    } finally {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const computeDiffMetrics = useCallback((client: AudioBuffer, server: AudioBuffer): ExportCompareMetrics => {
    const n = Math.min(client.length, server.length);
    if (n <= 1) return { ok: false, error: "Rendered WAVs are too short to compare." };

    const channels = Math.min(client.numberOfChannels, server.numberOfChannels, 2);
    let rmsClientSum = 0;
    let rmsServerSum = 0;
    let rmsDiffSum = 0;
    let peakDiff = 0;

    for (let ch = 0; ch < channels; ch++) {
      const c = client.getChannelData(ch);
      const s = server.getChannelData(ch);
      let sumC2 = 0;
      let sumS2 = 0;
      let sumD2 = 0;
      for (let i = 0; i < n; i++) {
        const dc = c[i];
        const ds = s[i];
        const d = dc - ds;
        sumC2 += dc * dc;
        sumS2 += ds * ds;
        sumD2 += d * d;
        peakDiff = Math.max(peakDiff, Math.abs(d));
      }
      const rmsC = Math.sqrt(sumC2 / n);
      const rmsS = Math.sqrt(sumS2 / n);
      const rmsD = Math.sqrt(sumD2 / n);
      rmsClientSum += rmsC;
      rmsServerSum += rmsS;
      rmsDiffSum += rmsD;
    }

    const div = Math.max(1, channels);
    const rmsClient = rmsClientSum / div;
    const rmsServer = rmsServerSum / div;
    const rmsDiff = rmsDiffSum / div;
    const rmsDiffDb =
      rmsClient > 0 && rmsDiff > 0 ? 20 * Math.log10(rmsDiff / rmsClient) : undefined;

    const durationSecClient = client.duration;
    const durationSecServer = server.duration;

    return {
      ok: true,
      durationSecClient,
      durationSecServer,
      durationDiffSec: Math.abs(durationSecClient - durationSecServer),
      rmsClient,
      rmsServer,
      rmsDiff,
      rmsDiffDb,
      peakDiff,
    };
  }, []);

  const exportMasterWav = useCallback(async (
    options: { normalize?: boolean; skipBusy?: boolean } | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    onError: (msg: string) => void
  ) => {
    if (Object.keys(stemBuffers).length === 0) {
      onError("Load stems to tracks first before exporting");
      return;
    }
    if (!options?.skipBusy) { setIsExporting(true); }

    try {
      const wavBlob = await renderClientMasterWavBlob({ normalize: options?.normalize }, stemBuffers, splitResultStems, stemStates, uploadName);
      triggerDownload(wavBlob, `${uploadName.replace(/\.[^/.]+$/, "")}_master.wav`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export failed");
    } finally {
      if (!options?.skipBusy) setIsExporting(false);
    }
  }, [renderClientMasterWavBlob, triggerDownload]);

  const exportMasterMp3 = useCallback(async (
    options: { normalize?: boolean; skipBusy?: boolean } | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    onError: (msg: string) => void
  ) => {
    if (Object.keys(stemBuffers).length === 0) {
      onError("Load stems to tracks first before exporting");
      return;
    }
    if (!options?.skipBusy) setIsExporting(true);

    try {
      const wavBlob = await renderClientMasterWavBlob({ normalize: options?.normalize }, stemBuffers, splitResultStems, stemStates, uploadName);
      const mp3Blob = encodeWavToMp3(await wavBlob.arrayBuffer());
      triggerDownload(mp3Blob, `${uploadName.replace(/\.[^/.]+$/, "")}_master.mp3`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export failed");
    } finally {
      if (!options?.skipBusy) setIsExporting(false);
    }
  }, [renderClientMasterWavBlob, encodeWavToMp3, triggerDownload]);

  const handleExportWithOptions = useCallback(async (
    options: ExportOptions,
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    onError: (msg: string) => void,
    onClose: () => void,
    serverExportJobId?: string | null,
    serverExportStemIds?: string[]
  ) => {
    if ((options.target === "stems" || options.target === "all") && splitResultStems.length === 0) {
      onError("No stems to export. Split a track or load stems first.");
      return;
    }
    setIsExporting(true);
    try {
      if (options.target === "master" || options.target === "all") {
        const normalize = options.normalize;
        const format = options.format;

        const canTryServer =
          typeof serverExportJobId === "string" &&
          serverExportJobId.length > 0 &&
          Array.isArray(serverExportStemIds) &&
          serverExportStemIds.length > 0;

        if (format === "mp3") {
          // MP3 export currently uses client-side encoding from rendered WAV.
          await exportMasterMp3({ normalize, skipBusy: true }, stemBuffers, splitResultStems, stemStates, uploadName, onError);
        } else if (canTryServer) {
          try {
            await exportMasterWavServer(serverExportJobId as string, serverExportStemIds as string[], stemStates, uploadName, normalize);
          } catch (e) {
            const status = typeof e === "object" && e && "status" in e ? (e as any).status : undefined;
            // Server export disabled => fall back to client export.
            if (status === 404) {
              await exportMasterWav({ normalize, skipBusy: true }, stemBuffers, splitResultStems, stemStates, uploadName, onError);
            } else {
              throw e;
            }
          }
        } else {
          await exportMasterWav({ normalize, skipBusy: true }, stemBuffers, splitResultStems, stemStates, uploadName, onError);
        }
      }
      if (options.target === "stems" || options.target === "all") {
        const baseName = uploadName.replace(/\.[^/.]+$/, "");
        for (const stem of splitResultStems) await downloadStemByUrl(stem, baseName);
      }
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [exportMasterMp3, exportMasterWav, exportMasterWavServer, downloadStemByUrl]);

  const compareMasterExportServerAndClient = useCallback(async (params: {
    serverExportJobId: string;
    stemBuffers: Record<string, AudioBuffer>;
    splitResultStems: StemResult[];
    stemStates: Record<string, StemEditorState>;
    uploadName: string;
    normalize: boolean;
    stemIds: string[];
  }): Promise<ExportCompareMetrics> => {
    try {
      if (!params.serverExportJobId) throw new Error("Missing serverExportJobId");
      if (!params.stemIds || params.stemIds.length === 0) throw new Error("Missing stemIds for server comparison");
      if (Object.keys(params.stemBuffers).length === 0) throw new Error("No stem buffers loaded");

      // 1) Client render
      const clientBlob = await renderClientMasterWavBlob(
        { normalize: params.normalize },
        params.stemBuffers,
        params.splitResultStems,
        params.stemStates,
        params.uploadName
      );

      // 2) Server render (WAV response as blob)
      // For parity, send only the stemIds we intend to mix.
      const stemStatesSubset: Record<string, StemEditorState> = {};
      for (const id of params.stemIds) {
        if (params.stemStates[id]) stemStatesSubset[id] = params.stemStates[id];
      }

      const serverBlob = await serverExportMasterWav({
        job_id: params.serverExportJobId,
        stem_ids: params.stemIds,
        stem_states: stemStatesSubset,
        upload_name: params.uploadName,
        normalize: params.normalize,
      });

      const [clientBuf, serverBuf] = await Promise.all([
        decodeWavBlobToAudioBuffer(clientBlob),
        decodeWavBlobToAudioBuffer(serverBlob),
      ]);

      const metrics = computeDiffMetrics(clientBuf, serverBuf);
      if (metrics.ok) {
        // Helpful for development without relying on UI.
        // eslint-disable-next-line no-console
        console.log("[export-compare] metrics:", metrics);
      }
      return metrics;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Compare failed" };
    }
  }, [renderClientMasterWavBlob, decodeWavBlobToAudioBuffer, computeDiffMetrics]);

  return {
    isExporting,
    exportMasterWav,
    handleExportWithOptions,
    compareMasterExportServerAndClient,
  };
}
