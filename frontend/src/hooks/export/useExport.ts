/**
 * useExport — default **client-side** master WAV (OfflineAudioContext), optional **MP3**, **ZIP** bundles, per-stem fetch.
 * **`POST /api/stems/server-export`** (master WAV only) when **`VITE_SERVER_EXPORT_ENABLED`** matches backend **`SERVER_EXPORT_ENABLED`**; token metering on that route follows docs/BILLING-AND-TOKENS.md. See docs/ARCHITECTURE-FLOW.md.
 * Master mix stem set matches playback via `filterStemsForAudibleMix`.
 */
import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import { fetchStemWavAsBlob, serverExportMasterWav } from "../../api";
import { renderMasteredWav } from "../../api/master";
import { SERVER_EXPORT_ENABLED } from "../../config";
import type { StemResult } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import type { ExportOptions } from "../../components";
import { trackEvent } from "../../analytics/events";
import { downloadBlob, isTouchDevice } from "../../utils/downloadHelper";

import { stripFileExtension, buildMasterExportFilename } from "./exportFilename";
import { encodeWavToMp3 } from "./encodeMp3";
import { renderClientMasterWavBlob } from "./renderClientMaster";
import { compareMasterExportServerAndClient, type ExportCompareMetrics } from "./exportCompareMetrics";

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
    serverExportStemIds?: string[],
    /** Called only when export completes without any onError from export paths. */
    onSuccess?: () => void
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

export function useExport(): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const lastExportAtRef = useRef(0);
  const EXPORT_ACTION_COOLDOWN_MS = 8000;

  const triggerDownload = useCallback(async (blob: Blob, filename: string) => {
    await downloadBlob(blob, filename);
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
      await triggerDownload(wavBlob, buildMasterExportFilename(uploadName, "wav"));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export failed");
    } finally {
      if (!options?.skipBusy) setIsExporting(false);
    }
  }, [triggerDownload]);

  const handleExportWithOptions = useCallback(async (
    options: ExportOptions,
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    onError: (msg: string) => void,
    onClose: () => void,
    serverExportJobId?: string | null,
    serverExportStemIds?: string[],
    onSuccess?: () => void
  ) => {
    trackEvent("export_started", {
      target: options.target,
      format: options.format,
      normalize: options.normalize,
      has_loaded_stems: splitResultStems.some((s) => s.id.startsWith("loaded_")),
      stem_count: splitResultStems.length,
    });
    const now = Date.now();
    const msSinceLastExport = now - lastExportAtRef.current;
    if (msSinceLastExport < EXPORT_ACTION_COOLDOWN_MS) {
      const waitSeconds = Math.max(
        1,
        Math.ceil((EXPORT_ACTION_COOLDOWN_MS - msSinceLastExport) / 1000),
      );
      onError(
        `Please wait ${waitSeconds}s before starting another export.`,
      );
      trackEvent("export_blocked_cooldown", { wait_seconds: waitSeconds });
      return;
    }

    let hadError = false;
    const wrapErr = (msg: string) => {
      hadError = true;
      onError(msg);
    };

    if ((options.target === "stems" || options.target === "all") && splitResultStems.length === 0) {
      onError("No stems to export. Split a track or load stems first.");
      trackEvent("export_failed_validation", { reason: "no_stems" });
      return;
    }
    setIsExporting(true);
    try {
      const requiresZip = options.target === "stems" || options.target === "all";
      let masterBlob: { blob: Blob; filename: string } | null = null;
      const baseName = stripFileExtension(uploadName);

      if (options.target === "master" || options.target === "all") {
        const normalize = options.normalize;
        const format = options.format;
        const masteringPresetId = options.masteringPresetId?.trim() || null;

        const canTryServer =
          SERVER_EXPORT_ENABLED &&
          typeof serverExportJobId === "string" &&
          serverExportJobId.length > 0 &&
          Array.isArray(serverExportStemIds) &&
          serverExportStemIds.length > 0;

        let curBlob: Blob | undefined;
        try {
          if (
            masteringPresetId &&
            format === "wav" &&
            typeof serverExportJobId === "string" &&
            serverExportJobId.length > 0
          ) {
            curBlob = await renderMasteredWav({
              jobId: serverExportJobId,
              presetId: masteringPresetId,
            });
          } else if (format === "mp3") {
            const wavB = await renderClientMasterWavBlob({ normalize }, stemBuffers, splitResultStems, stemStates, uploadName);
            curBlob = await encodeWavToMp3(await wavB.arrayBuffer());
          } else if (canTryServer) {
            try {
              const stemStatesSubset: Record<string, StemEditorState> = {};
              for (const id of serverExportStemIds as string[]) {
                if (stemStates[id]) stemStatesSubset[id] = stemStates[id];
              }
              curBlob = await serverExportMasterWav({
                job_id: serverExportJobId as string,
                stem_ids: serverExportStemIds as string[],
                stem_states: stemStatesSubset,
                upload_name: uploadName,
                normalize: normalize ?? false,
              });
            } catch (e) {
              const status = typeof e === "object" && e !== null && "status" in e ? (e as { status: unknown }).status : undefined;
              if (status === 404) {
                curBlob = await renderClientMasterWavBlob({ normalize }, stemBuffers, splitResultStems, stemStates, uploadName);
              } else {
                throw e;
              }
            }
          } else {
            curBlob = await renderClientMasterWavBlob({ normalize }, stemBuffers, splitResultStems, stemStates, uploadName);
          }
          if (curBlob) {
            masterBlob = { blob: curBlob, filename: buildMasterExportFilename(uploadName, format) };
          }
        } catch (e) {
          wrapErr(e instanceof Error ? e.message : "Master export failed");
        }

        // If not zipping, just download it directly now.
        if (masterBlob && !requiresZip && !hadError) {
          await triggerDownload(masterBlob.blob, masterBlob.filename);
        }
      }

      if (requiresZip && !hadError) {
        // Only job-backed stems (split pipeline). Loaded file stems use blob: URLs — skip those here.
        const jobBacked = splitResultStems.filter((s) => s.url.includes("/api/stems/file/"));

        if (jobBacked.length === 0 && !masterBlob) {
          wrapErr("No valid stems or master track to export.");
          return;
        }

        const zip = new JSZip();

        if (masterBlob) {
          zip.file(masterBlob.filename, masterBlob.blob);
        }

        const stemFormat = options.format === "mp3" ? "mp3" : "wav";

        // On mobile, fetch (and optionally encode) stems sequentially to avoid memory pressure.
        // On desktop, process concurrently for speed.
        let stemResults: { id: string; blob: Blob }[];
        if (isTouchDevice()) {
          stemResults = [];
          for (const stem of jobBacked) {
            let blob = await fetchStemWavAsBlob(stem.url);
            if (stemFormat === "mp3") {
              blob = await encodeWavToMp3(await blob.arrayBuffer());
            }
            stemResults.push({ id: stem.id, blob });
          }
        } else {
          stemResults = await Promise.all(
            jobBacked.map(async (stem) => {
              let blob = await fetchStemWavAsBlob(stem.url);
              if (stemFormat === "mp3") {
                blob = await encodeWavToMp3(await blob.arrayBuffer());
              }
              return { id: stem.id, blob };
            })
          );
        }

        for (const sr of stemResults) {
          zip.file(`${baseName}_${sr.id}.${stemFormat}`, sr.blob);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        await triggerDownload(zipBlob, `${baseName}_export.zip`);
      }
      lastExportAtRef.current = Date.now();
      onClose();
      if (!hadError) onSuccess?.();
      trackEvent("export_completed", {
        target: options.target,
        format: options.format,
      });
    } catch (e) {
      wrapErr(e instanceof Error ? e.message : "Export failed");
      trackEvent("export_failed", {
        target: options.target,
        format: options.format,
        error: (e instanceof Error ? e.message : "Export failed").slice(0, 120),
      });
    } finally {
      setIsExporting(false);
    }
  }, [triggerDownload]);

  const compareMasterExportServerAndClientCb = useCallback(async (params: {
    serverExportJobId: string;
    stemBuffers: Record<string, AudioBuffer>;
    splitResultStems: StemResult[];
    stemStates: Record<string, StemEditorState>;
    uploadName: string;
    normalize: boolean;
    stemIds: string[];
  }): Promise<ExportCompareMetrics> => {
    return compareMasterExportServerAndClient(params);
  }, []);

  return {
    isExporting,
    exportMasterWav,
    handleExportWithOptions,
    compareMasterExportServerAndClient: compareMasterExportServerAndClientCb,
  };
}
