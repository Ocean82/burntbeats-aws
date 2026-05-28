import { useCallback, useEffect, useRef, useState } from "react";

interface UseSplitSessionLifecycleArgs {
  isSplitting: boolean;
  splitResultStemsLength: number;
  splitJobId: string | null;
  onResetStemMediaState: () => void;
  onFocusMixer?: () => void;
}

export function useSplitSessionLifecycle({
  isSplitting,
  splitResultStemsLength,
  splitJobId,
  onResetStemMediaState,
  onFocusMixer,
}: UseSplitSessionLifecycleArgs) {
  const [hasCompletedFirstExport, setHasCompletedFirstExport] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const prevSplitJobIdRef = useRef<string | null>(null);
  const wasSplittingRef = useRef(false);

  useEffect(() => {
    if (splitJobId && splitJobId !== prevSplitJobIdRef.current) {
      if (prevSplitJobIdRef.current != null) {
        onResetStemMediaState();
      }
      prevSplitJobIdRef.current = splitJobId;
    }
    if (!splitJobId) {
      prevSplitJobIdRef.current = null;
    }
  }, [splitJobId, onResetStemMediaState]);

  useEffect(() => {
    if (wasSplittingRef.current && !isSplitting && splitResultStemsLength > 0) {
      const t = window.setTimeout(() => {
        onFocusMixer?.();
      }, 320);
      return () => window.clearTimeout(t);
    }
    wasSplittingRef.current = isSplitting;
  }, [isSplitting, splitResultStemsLength, onFocusMixer]);

  useEffect(() => {
    if (!exportNotice) return;
    const t = window.setTimeout(() => setExportNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [exportNotice]);

  const onSuccessfulExport = useCallback(() => {
    setExportNotice("Download started — check your browser’s downloads folder.");
    setHasCompletedFirstExport(true);
  }, []);

  return {
    prevSplitJobIdRef,
    hasCompletedFirstExport,
    setHasCompletedFirstExport,
    exportNotice,
    setExportNotice,
    onSuccessfulExport,
  };
}
