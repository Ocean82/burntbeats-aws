/**
 * Debugging utility: compare server vs client master export.
 * Computes RMS difference, peak difference, and duration delta.
 */
import { serverExportMasterWav } from "../../api";
import type { StemResult } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { renderClientMasterWavBlob } from "./renderClientMaster";

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

export async function decodeWavBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("AudioContext not supported in this browser");
  const ctx = new AudioContextCtor();
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
  }
}

export function computeDiffMetrics(client: AudioBuffer, server: AudioBuffer): ExportCompareMetrics {
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
}

export async function compareMasterExportServerAndClient(params: {
  serverExportJobId: string;
  stemBuffers: Record<string, AudioBuffer>;
  splitResultStems: StemResult[];
  stemStates: Record<string, StemEditorState>;
  uploadName: string;
  normalize: boolean;
  stemIds: string[];
}): Promise<ExportCompareMetrics> {
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

    return computeDiffMetrics(clientBuf, serverBuf);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Compare failed" };
  }
}
