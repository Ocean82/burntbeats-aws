/**
 * useStemSplitting: upload → split workflow.
 * Premium/Studio: choosing 4 stems calls the API once with stems=4 (single job).
 * Manual "Expand → 4 stems" still uses the expand endpoint after a 2-stem run.
 */
import { useCallback, useEffect, useRef } from "react";
import { splitStems, expandStems, type SplitQuality } from "../api";
import { MAX_UPLOAD_BYTES, PIPELINE_PROGRESS_THRESHOLDS } from "../config";
import { useAppStore } from "../store/appStore";
import type { UseSubscriptionResult } from "./useSubscription";

interface UseStemSplittingArgs {
  subscription: UseSubscriptionResult;
  stopPreview: () => void;
  splitQuality: SplitQuality;
  isBasicPlan: boolean;
}

export function useStemSplitting({
  subscription,
  stopPreview,
  splitQuality,
  isBasicPlan,
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
    if (isBasicPlan) {
      setUploadState((prev) => (prev.quality === "speed" ? prev : { ...prev, quality: "speed" }));
    }
  }, [isBasicPlan, setUploadState]);

  const handleFile = useCallback((file: File | null) => {
    if (!file) {
      setUploadState((prev) => ({ ...prev, uploadedFile: null }));
      return;
    }
    setUploadState((prev) => ({
      ...prev,
      uploadName: file.name,
      uploadedFile: file,
      splitProgress: 0,
      pipelineIndex: 0,
      splitError: null,
      splitResultStems: [],
      splitJobId: null,
      loadedStems: prev.loadedStems.filter((stem) => {
        if (stem.id.startsWith("loaded_")) {
          URL.revokeObjectURL(stem.url);
          return false;
        }
        return true;
      }),
    }));
  }, []);

  const handleLoadStems = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const ts = Date.now();
    const next = Array.from(files).map((file, i) => ({
      id: `loaded_${ts}_${i}`,
      label: file.name,
      url: URL.createObjectURL(file),
    }));
    loadedUrlsRef.current.push(...next.map((s) => s.url));
    setUploadState((prev) => ({
      ...prev,
      loadedStems: [...prev.loadedStems, ...next],
    }));
  }, []);

  const removeLoadedStem = useCallback((id: string) => {
    setUploadState((prev) => {
      const removedEntry = prev.loadedStems.find((stem) => stem.id === id);
      if (removedEntry) URL.revokeObjectURL(removedEntry.url);
      return {
        ...prev,
        loadedStems: prev.loadedStems.filter((stem) => stem.id !== id),
      };
    });
  }, []);

  const triggerSplit = useCallback(async (requestedStemMode: 2 | 4 = 2) => {
    const { status } = subscription;
    if (status !== "active") {
      await subscription.startCheckout("basic");
      return;
    }
    stopPreview();
    const file = useAppStore.getState().uploadedFile;
    if (!file || !(file instanceof File) || file.size === 0) {
      setUploadState((prev) => ({ ...prev, splitError: "Upload an audio file first." }));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      const mb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
      setUploadState((prev) => ({ ...prev, splitError: `File too large. Maximum size is ${mb}MB.` }));
      return;
    }
    setUploadState((prev) => ({ ...prev, isSplitting: true, splitProgress: 0, pipelineIndex: 0, splitError: null }));
    try {
      // Premium/Studio: one server job for 4 stems (hybrid MDX + PyTorch Demucs / SCNet per backend).
      // Basic: 2-stem only.
      const stemsArg =
        requestedStemMode === 4 && !isBasicPlan ? ("4" as const) : ("2" as const);
      const res = await splitStems(file, stemsArg, splitQuality, (s) => {
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
      }));
    } catch (err) {
      setUploadState((prev) => ({
        ...prev,
        splitError: err instanceof Error ? err.message : "Split failed",
        splitProgress: 0,
        pipelineIndex: 0,
      }));
    } finally {
      setUploadState((prev) => ({ ...prev, isSplitting: false }));
    }
  }, [isBasicPlan, splitQuality, stopPreview, subscription]);

  const triggerExpand = useCallback(async () => {
    if (isBasicPlan) {
      setSplitError("4-stem expand requires Premium or Studio.");
      return;
    }
    const { splitJobId, splitResultStems } = useAppStore.getState();
    if (!splitJobId || splitResultStems.length !== 2) return;
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
      }));
    } catch (err) {
      setUploadState((prev) => ({
        ...prev,
        splitError: err instanceof Error ? err.message : "Expand failed",
        splitProgress: 0,
        pipelineIndex: 0,
      }));
    } finally {
      setUploadState((prev) => ({ ...prev, isExpanding: false }));
    }
  }, [splitQuality, isBasicPlan, setSplitError]);

  return { handleFile, handleLoadStems, removeLoadedStem, triggerSplit, triggerExpand };
}
