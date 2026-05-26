/**
 * useStemSplitting: upload → split workflow.
 * Premium/Studio: choosing 4 stems calls the API once with stems=4 (single job).
 * Manual "Expand → 4 stems" still uses the expand endpoint after a 2-stem run.
 */
import { useCallback, useEffect, useRef } from "react";
import { splitStems, expandStems, type SplitQuality } from "../api";
import { MAX_UPLOAD_BYTES, PIPELINE_PROGRESS_THRESHOLDS, isAllowedAudioFile, ALLOWED_AUDIO_FORMATS_LABEL } from "../config";
import { useAppStore } from "../store/appStore";
import type { UseSubscriptionResult } from "./useSubscription";
import { trackEvent } from "../analytics/events";

interface UseStemSplittingArgs {
  subscription: UseSubscriptionResult;
  stopPreview: () => void;
  splitQuality: SplitQuality;
  canSplitFourStems: boolean;
  canExpandToFourStems: boolean;
  canUsePremiumStemQualities: boolean;
}

export function useStemSplitting({
  subscription,
  stopPreview,
  splitQuality,
  canSplitFourStems,
  canExpandToFourStems,
  canUsePremiumStemQualities,
}: UseStemSplittingArgs) {
  const setUploadState = useAppStore((s) => s.setUploadState);
  const setSplitError = useAppStore((s) => s.setSplitError);
  const loadedUrlsRef = useRef<string[]>([]);

  // Revoke all tracked object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of loadedUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      loadedUrlsRef.current = [];
    };
  }, []);

  // Force quality to "speed" on basic plan
  useEffect(() => {
    if (!canUsePremiumStemQualities) {
      setUploadState((prev) => (prev.quality === "speed" ? prev : { ...prev, quality: "speed" }));
    }
  }, [canUsePremiumStemQualities, setUploadState]);

  const handleFile = useCallback((file: File | null) => {
    if (!file) {
      setUploadState((prev) => ({ ...prev, uploadedFile: null }));
      trackEvent("track_upload_cleared");
      return;
    }
    // Client-side format validation — reject unsupported files immediately
    if (!isAllowedAudioFile(file.name)) {
      const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "unknown" : "none";
      setUploadState((prev) => ({
        ...prev,
        splitError: `Unsupported format (.${extension}). Accepted: ${ALLOWED_AUDIO_FORMATS_LABEL}.`,
      }));
      trackEvent("track_upload_rejected_format", { file_extension: extension });
      return;
    }
    const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "unknown" : "none";
    trackEvent("track_upload_selected", {
      file_extension: extension,
      file_size_mb: Number((file.size / (1024 * 1024)).toFixed(2)),
    });
    setUploadState((prev) => ({
      ...prev,
      uploadName: file.name,
      uploadedFile: file,
      splitProgress: 0,
      uploadProgress: 0,
      pipelineIndex: 0,
      splitError: null,
      splitResultStems: [],
      splitJobId: null,
      beatGrid: null,
      loadedStems: prev.loadedStems.filter((stem) => {
        if (stem.id.startsWith("loaded_")) {
          URL.revokeObjectURL(stem.url);
          return false;
        }
        return true;
      }),
    }));
  }, [setUploadState]);

  const handleLoadStems = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const ts = Date.now();
    const next = Array.from(files).map((file, i) => ({
      id: `loaded_${ts}_${i}`,
      label: file.name,
      url: URL.createObjectURL(file),
      file,
    }));
    loadedUrlsRef.current.push(...next.map((s) => s.url));
    setUploadState((prev) => ({
      ...prev,
      loadedStems: [...prev.loadedStems, ...next],
    }));
  }, [setUploadState]);

  const removeLoadedStem = useCallback((id: string) => {
    setUploadState((prev) => {
      const removedEntry = prev.loadedStems.find((stem) => stem.id === id);
      if (removedEntry) URL.revokeObjectURL(removedEntry.url);
      return {
        ...prev,
        loadedStems: prev.loadedStems.filter((stem) => stem.id !== id),
      };
    });
  }, [setUploadState]);

  const triggerSplit = useCallback(async (requestedStemMode: 2 | 4 = 2, isSample = false) => {
    const { status } = subscription;
    if (status !== "active" && !isSample) {
      trackEvent("split_blocked_subscription_inactive", {
        requested_stems: requestedStemMode,
      });
      trackEvent("checkout_preprompt_shown", {
        source: "split_gate",
        suggested_plan: "basic",
      });
      setUploadState((prev) => ({
        ...prev,
        splitError:
          "Full-track split requires a plan or one-time pack. Review options below, or use Try for free.",
      }));
      return;
    }
    stopPreview();
    const file = useAppStore.getState().uploadedFile;
    if (!file || !(file instanceof File) || file.size === 0) {
      setUploadState((prev) => ({ ...prev, splitError: "Upload an audio file first." }));
      trackEvent("split_failed_validation", { reason: "missing_upload", requested_stems: requestedStemMode });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      const mb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
      setUploadState((prev) => ({ ...prev, splitError: `File too large. Maximum size is ${mb}MB.` }));
      trackEvent("split_failed_validation", {
        reason: "file_too_large",
        requested_stems: requestedStemMode,
        max_upload_mb: mb,
      });
      return;
    }
    setUploadState((prev) => ({
      ...prev,
      isSplitting: true,
      isUploading: true,
      uploadProgress: 0,
      splitProgress: 0,
      pipelineIndex: 0,
      splitError: null,
      isSample,
      splitElapsedSeconds: null,
    }));
    try {
      // Premium/Studio: one server job for 4 stems (hybrid MDX + PyTorch Demucs / SCNet per backend).
      // Basic: 2-stem only.
      const stemsArg =
        requestedStemMode === 4 && canSplitFourStems ? ("4" as const) : ("2" as const);
      trackEvent("split_started", {
        requested_stems: requestedStemMode,
        actual_stems: Number(stemsArg),
        quality: splitQuality,
        plan: subscription.plan ?? "none",
      });
      const res = await splitStems(file, stemsArg, splitQuality, isSample, (s) => {
        setUploadState((prev) => ({
          ...prev,
          isUploading: false,
          splitProgress: s.progress,
          queuePosition: s.status === "queued" ? (s.queue_position ?? null) : null,
          splitElapsedSeconds:
            s.status === "running" && s.elapsed_seconds != null
              ? s.elapsed_seconds
              : prev.splitElapsedSeconds,
        }));
        // Update document title for background awareness (visible in mobile tab switcher)
        if (s.status === "queued") {
          document.title = `(Queued) Splitting… — Burnt Beats`;
        } else {
          document.title = `(${Math.round(s.progress)}%) Splitting… — Burnt Beats`;
        }
        if (s.progress >= PIPELINE_PROGRESS_THRESHOLDS.step3) setUploadState((prev) => ({ ...prev, pipelineIndex: 3 }));
        else if (s.progress >= PIPELINE_PROGRESS_THRESHOLDS.step2) setUploadState((prev) => ({ ...prev, pipelineIndex: 2 }));
        else if (s.progress > 0) setUploadState((prev) => ({ ...prev, pipelineIndex: 1 }));
      }, (uploadEvt) => {
        setUploadState((prev) => ({ ...prev, uploadProgress: uploadEvt.percent }));
        document.title = `(Uploading ${uploadEvt.percent}%) — Burnt Beats`;
      });
      setUploadState((prev) => ({
        ...prev,
        splitResultStems: res.stems,
        splitJobId: res.job_id,
        splitProgress: 100,
        pipelineIndex: 3,
        beatGrid: res.beat_grid ?? null,
        queuePosition: null,
        splitElapsedSeconds: null,
      }));
      document.title = "✓ Stems Ready — Burnt Beats";
      // Restore original title after a few seconds
      setTimeout(() => { document.title = "Burnt Beats — Stem Splitter"; }, 5000);
      trackEvent("split_completed", {
        stems_count: res.stems.length,
        quality: splitQuality,
      });
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Couldn't complete split. Try again.";
      document.title = "Burnt Beats — Stem Splitter";
      setUploadState((prev) => ({
        ...prev,
        splitError: errMsg,
        splitProgress: 0,
        pipelineIndex: 0,
        queuePosition: null,
        splitElapsedSeconds: null,
      }));
      trackEvent("split_failed", {
        quality: splitQuality,
        error: errMsg.slice(0, 120),
      });
    } finally {
      setUploadState((prev) => ({ ...prev, isSplitting: false, isUploading: false, uploadProgress: 0 }));
    }
  }, [
    canSplitFourStems,
    splitQuality,
    stopPreview,
    subscription,
    setUploadState,
  ]);

  const triggerExpand = useCallback(async () => {
    if (!canExpandToFourStems) {
      setSplitError("4-stem expand requires Premium or Studio.");
      trackEvent("expand_blocked_basic_plan");
      return;
    }
    const { splitJobId, splitResultStems } = useAppStore.getState();
    if (!splitJobId || splitResultStems.length !== 2) return;
    trackEvent("expand_started", { quality: splitQuality, from_stems: splitResultStems.length });
    setUploadState((prev) => ({ ...prev, splitError: null, isExpanding: true, splitProgress: 0, pipelineIndex: 0 }));
    try {
      const res = await expandStems(splitJobId, splitQuality, (s) => {
        setUploadState((prev) => ({ ...prev, splitProgress: s.progress }));
        if (s.progress >= PIPELINE_PROGRESS_THRESHOLDS.step3) setUploadState((prev) => ({ ...prev, pipelineIndex: 3 }));
        else if (s.progress >= PIPELINE_PROGRESS_THRESHOLDS.step2) setUploadState((prev) => ({ ...prev, pipelineIndex: 2 }));
        else if (s.progress > 0) setUploadState((prev) => ({ ...prev, pipelineIndex: 1 }));
      });
      setUploadState((prev) => ({
        ...prev,
        splitResultStems: res.stems,
        splitJobId: res.job_id,
        splitProgress: 100,
        pipelineIndex: 3,
        beatGrid: res.beat_grid ?? prev.beatGrid,
      }));
      trackEvent("expand_completed", { stems_count: res.stems.length, quality: splitQuality });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Expand failed";
      setUploadState((prev) => ({
        ...prev,
        splitError: errMsg,
        splitProgress: 0,
        pipelineIndex: 0,
      }));
      trackEvent("expand_failed", { error: errMsg.slice(0, 120), quality: splitQuality });
    } finally {
      setUploadState((prev) => ({ ...prev, isExpanding: false }));
    }
  }, [splitQuality, canExpandToFourStems, setSplitError, setUploadState]);

  return { handleFile, handleLoadStems, removeLoadedStem, triggerSplit, triggerExpand };
}
