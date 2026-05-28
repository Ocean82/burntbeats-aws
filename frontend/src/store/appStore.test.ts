import { beforeEach, describe, expect, it } from "vitest";
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
});
