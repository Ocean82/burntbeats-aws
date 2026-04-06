import { useCallback, useMemo, useState } from "react";
import type { StemResult } from "../types";
import type { StemEditorState } from "../stem-editor-state";
import type { ExportCompareMetrics } from "./useExport";

interface UseExportCompareArgs {
  compareMasterExportServerAndClient: (params: {
    serverExportJobId: string;
    stemBuffers: Record<string, AudioBuffer>;
    splitResultStems: StemResult[];
    stemStates: Record<string, StemEditorState>;
    uploadName: string;
    normalize: boolean;
    stemIds: string[];
  }) => Promise<ExportCompareMetrics>;
  loadedStemCount: number;
  splitJobId: string | null;
  splitResultStems: StemResult[];
  stemBuffers: Record<string, AudioBuffer>;
  stemStates: Record<string, StemEditorState>;
  uploadName: string;
}

export function useExportCompare({
  compareMasterExportServerAndClient,
  loadedStemCount,
  splitJobId,
  splitResultStems,
  stemBuffers,
  stemStates,
  uploadName,
}: UseExportCompareArgs) {
  const [isComparingExport, setIsComparingExport] = useState(false);
  const [exportCompareSummary, setExportCompareSummary] = useState<string | null>(
    null,
  );

  const canCompareExport = useMemo(
    () =>
      loadedStemCount === 0 &&
      typeof splitJobId === "string" &&
      splitJobId.length > 0 &&
      splitResultStems.length > 0,
    [loadedStemCount, splitJobId, splitResultStems.length],
  );

  const onCompareExport = useCallback(() => {
    if (!canCompareExport || !splitJobId) return;
    void (async () => {
      setIsComparingExport(true);
      setExportCompareSummary(null);
      try {
        const metrics = await compareMasterExportServerAndClient({
          serverExportJobId: splitJobId,
          stemBuffers,
          splitResultStems,
          stemStates,
          uploadName,
          normalize: true,
          stemIds: splitResultStems.map((s) => s.id),
        });
        if (!metrics.ok) {
          setExportCompareSummary(
            `Compare failed: ${metrics.error ?? "unknown error"}`,
          );
          return;
        }
        const rmsDb =
          metrics.rmsDiffDb != null ? `${metrics.rmsDiffDb.toFixed(1)} dB` : "n/a";
        setExportCompareSummary(
          `Server vs Client: duration diff ${
            metrics.durationDiffSec?.toFixed(3) ?? "n/a"
          }s, RMS diff ${rmsDb}, peak diff ${
            metrics.peakDiff?.toFixed(4) ?? "n/a"
          }`,
        );
      } catch (error) {
        setExportCompareSummary(
          `Compare failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      } finally {
        setIsComparingExport(false);
      }
    })();
  }, [
    canCompareExport,
    compareMasterExportServerAndClient,
    splitJobId,
    stemBuffers,
    splitResultStems,
    stemStates,
    uploadName,
  ]);

  return {
    isComparingExport,
    exportCompareSummary,
    onCompareExport: canCompareExport ? onCompareExport : undefined,
  };
}
