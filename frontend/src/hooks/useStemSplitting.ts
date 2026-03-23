/**
 * useStemSplitting: manages the upload → split → expand workflow.
 * Handles file selection, 2-stem split, and 2→4-stem expansion.
 */
import { useCallback, useEffect, useRef } from "react";
import { splitStems, expandStems, type SplitQuality } from "../api";
import { PIPELINE_PROGRESS_THRESHOLDS } from "../config";
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
  const uploadedFileRef = useRef<File | null>(null);

  // Keep uploadedFileRef in sync with store
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      uploadedFileRef.current = state.uploadedFile;
    });
    // Initialize from current state
    uploadedFileRef.current = useAppStore.getState().uploadedFile;
    return unsub;
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

  const triggerSplit = useCallback(async () => {
    const { status } = subscription;
    if (status !== "active") {
      await subscription.startCheckout("basic");
      return;
    }
    stopPreview();
    const file = uploadedFileRef.current;
    if (!file || !(file instanceof File) || file.size === 0) {
      setUploadState((prev) => ({ ...prev, splitError: "Upload an audio file first." }));
      return;
    }
    setUploadState((prev) => ({ ...prev, isSplitting: true, splitProgress: 0, pipelineIndex: 0, splitError: null }));
    try {
      const res = await splitStems(file, "2", splitQuality, (s) => {
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
  }, [splitQuality, stopPreview, subscription]);

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
