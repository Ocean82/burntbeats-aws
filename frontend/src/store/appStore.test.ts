import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./appStore";

describe("appStore sanitization", () => {
  beforeEach(() => {
    useAppStore.setState({
      quality: "quality",
      splitProgress: 0,
      uploadProgress: 0,
      pipelineIndex: 0,
    });
  });

  it("clamps percentage values to [0, 100]", () => {
    useAppStore.getState().setUploadState({
      splitProgress: 140,
      uploadProgress: -10,
    });

    const state = useAppStore.getState();
    expect(state.splitProgress).toBe(100);
    expect(state.uploadProgress).toBe(0);
  });

  it("normalizes pipeline index to non-negative integer", () => {
    useAppStore.getState().setUploadState({ pipelineIndex: -2.7 });
    expect(useAppStore.getState().pipelineIndex).toBe(0);

    useAppStore.getState().setUploadState({ pipelineIndex: 2.4 });
    expect(useAppStore.getState().pipelineIndex).toBe(2);
  });

  it("falls back to default quality for unknown quality strings", () => {
    useAppStore
      .getState()
      .setUploadState({ quality: "ultra" as unknown as "speed" | "quality" });

    expect(useAppStore.getState().quality).toBe("quality");
  });

  it("clears split workspace state without preserving stale user audio", () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { revokeObjectURL });
    useAppStore.setState({
      uploadName: "user-a-track.wav",
      uploadedFile: new File(["audio"], "user-a-track.wav"),
      splitResultStems: [{ id: "vocals", url: "/api/stems/file/job-a/vocals.wav" }],
      splitJobId: "job-a",
      loadedStems: [
        {
          id: "loaded_1",
          label: "private.wav",
          url: "blob:user-a",
          file: new File(["private"], "private.wav"),
        },
      ],
      splitError: "old error",
      isSample: true,
      isDragging: true,
      isSplitting: true,
      isExpanding: true,
      splitProgress: 80,
      uploadProgress: 70,
      isUploading: true,
      pipelineIndex: 2,
      beatGrid: { bpm: 120, beat_offset_seconds: 0, confidence: 0.9 },
      queuePosition: 1,
      jobsAhead: 0,
      splitElapsedSeconds: 12,
      splitStageLabel: "Separating",
    });

    useAppStore.getState().resetSplitSession();

    const state = useAppStore.getState();
    expect(state.uploadName).toBe("");
    expect(state.uploadedFile).toBeNull();
    expect(state.splitResultStems).toEqual([]);
    expect(state.splitJobId).toBeNull();
    expect(state.loadedStems).toEqual([]);
    expect(state.splitError).toBeNull();
    expect(state.isSample).toBe(false);
    expect(state.isDragging).toBe(false);
    expect(state.isSplitting).toBe(false);
    expect(state.isExpanding).toBe(false);
    expect(state.splitProgress).toBe(0);
    expect(state.uploadProgress).toBe(0);
    expect(state.isUploading).toBe(false);
    expect(state.pipelineIndex).toBe(0);
    expect(state.beatGrid).toBeNull();
    expect(state.queuePosition).toBeNull();
    expect(state.jobsAhead).toBeNull();
    expect(state.splitElapsedSeconds).toBeNull();
    expect(state.splitStageLabel).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:user-a");
    vi.unstubAllGlobals();
  });
});
