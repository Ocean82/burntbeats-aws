import { useCallback } from "react";
import type { MixStemRuntime } from "./useAudioPlayback";

export interface UseMixAnalyserReturn {
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
  getMasterAnalyserFrequencyData: () => Uint8Array | null;
  getStemAnalyserTimeDomainData: (stemId: string) => Uint8Array | null;
  getMasterRecordingStream: () => MediaStream | null;
}

export function useMixAnalyser(
  deps: {
    currentPreviewRuntimeRef: React.MutableRefObject<MixStemRuntime | null>;
    mixStemRuntimesRef: React.MutableRefObject<MixStemRuntime[]>;
    getMasterAnalyserTimeDomainData: () => Uint8Array | null;
    getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
    getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
    getMasterAnalyserFrequencyData: () => Uint8Array | null;
    getMasterRecordingStream: () => MediaStream | null;
  },
): UseMixAnalyserReturn {
  const {
    currentPreviewRuntimeRef,
    mixStemRuntimesRef,
    getMasterAnalyserTimeDomainData,
    getMasterAnalyserTimeDomainDataLeft,
    getMasterAnalyserTimeDomainDataRight,
    getMasterAnalyserFrequencyData,
    getMasterRecordingStream,
  } = deps;

  const getStemAnalyserTimeDomainData = useCallback(
    (stemId: string): Uint8Array | null => {
      const previewRuntime = currentPreviewRuntimeRef.current;
      if (previewRuntime?.stemId === stemId)
        return previewRuntime.dsp.getTimeDomainData();

      const mixRuntime = mixStemRuntimesRef.current.find(
        (runtime) => runtime.stemId === stemId,
      );
      if (!mixRuntime) return null;
      return mixRuntime.dsp.getTimeDomainData();
    },
    [currentPreviewRuntimeRef, mixStemRuntimesRef],
  );

  return {
    getMasterAnalyserTimeDomainData,
    getMasterAnalyserTimeDomainDataLeft,
    getMasterAnalyserTimeDomainDataRight,
    getMasterAnalyserFrequencyData,
    getStemAnalyserTimeDomainData,
    getMasterRecordingStream,
  };
}
