/**
 * useExport — handles WAV master export and per-stem download.
 * Extracted from App.tsx.
 */
import { useCallback, useState } from "react";
import type { StemResult } from "../types";
import { audioBufferToWav, normalizeAudioBuffer, trimToSeconds } from "../utils/audio";
import { defaultStemState, type StemEditorState } from "../components/MultiStemEditor";
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
    onClose: () => void
  ) => Promise<void>;
}

export function useExport(): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);

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
      const hasSolo = splitResultStems.some((s) => stemStates[s.id]?.soloed);
      const stemsToMix = hasSolo
        ? splitResultStems.filter((s) => stemStates[s.id]?.soloed)
        : splitResultStems.filter((s) => !stemStates[s.id]?.muted);

      let maxDuration = 0;
      const { getStemEffectiveRate } = await import("../components/MultiStemEditor");
      const sources: { buffer: AudioBuffer; gain: number; pan: number; rate: number; trimStart: number; trimEnd: number }[] = [];

      for (const stem of stemsToMix) {
        const buffer = stemBuffers[stem.id];
        if (!buffer) continue;
        const st = stemStates[stem.id] ?? defaultStemState();
        const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
        const rate = getStemEffectiveRate(st);
        const wallDuration = (trimEnd - trimStart) / rate;
        maxDuration = Math.max(maxDuration, wallDuration);
        sources.push({ buffer, gain: Math.pow(10, st.mixer.gain / 20), pan: st.mixer.pan / 100, rate, trimStart, trimEnd });
      }

      if (maxDuration === 0) throw new Error("No valid stems to export");

      const context = new OfflineAudioContext(2, Math.ceil(maxDuration * 44100), 44100);
      for (const { buffer, gain, pan, rate, trimStart, trimEnd } of sources) {
        const source = context.createBufferSource();
        const gainNode = context.createGain();
        const panNode = context.createStereoPanner();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        gainNode.gain.value = gain;
        panNode.pan.value = pan;
        source.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(context.destination);
        source.start(0, trimStart, trimEnd - trimStart);
      }

      let rendered = await context.startRendering();
      if (options?.normalize) rendered = normalizeAudioBuffer(rendered);
      const wavBlob = audioBufferToWav(rendered);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${uploadName.replace(/\.[^/.]+$/, "")}_master.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export failed");
    } finally {
      if (!options?.skipBusy) setIsExporting(false);
    }
  }, []);

  const handleExportWithOptions = useCallback(async (
    options: ExportOptions,
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    onError: (msg: string) => void,
    onClose: () => void
  ) => {
    if ((options.target === "stems" || options.target === "all") && splitResultStems.length === 0) {
      onError("No stems to export. Split a track or load stems first.");
      return;
    }
    setIsExporting(true);
    try {
      if (options.target === "master" || options.target === "all") {
        await exportMasterWav({ normalize: options.normalize, skipBusy: true }, stemBuffers, splitResultStems, stemStates, uploadName, onError);
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
  }, [exportMasterWav, downloadStemByUrl]);

  return { isExporting, exportMasterWav, handleExportWithOptions };
}
