import type { MutableRefObject } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/appStore";
import { useWorkflowStore } from "../store/workflowStore";

interface StemLoadingMockOptions {
  audioContextRef: MutableRefObject<AudioContext | null>;
}

const useStemLoadingMock = vi.fn((_options: StemLoadingMockOptions) => ({
  stemBuffers: {},
  setStemBuffers: vi.fn(),
  loadedTracks: {},
  isLoadingStems: false,
  clearStemLoadingState: vi.fn(),
  loadingError: null,
  loadingErrorsById: {},
  retryLoadStems: vi.fn(),
}));

vi.mock("../hooks/useStemLoading", () => ({
  useStemLoading: (options: StemLoadingMockOptions) => useStemLoadingMock(options),
}));

import { WorkflowProvider } from "./WorkflowContext";
import { StemMediaProvider } from "./StemMediaContext";

describe("StemMediaProvider stem loading", () => {
  beforeEach(() => {
    useStemLoadingMock.mockClear();
    useAppStore.setState({
      splitResultStems: [{ id: "vocals", url: "/api/stems/file/job-1/vocals.wav" }],
      loadedStems: [],
      splitError: null,
    });
    useWorkflowStore.setState({
      stemStates: {},
      canUndo: false,
      canRedo: false,
      past: [],
      future: [],
    });
  });

  it("invokes useStemLoading once with the provider-owned audioContextRef", () => {
    render(
      <WorkflowProvider>
        <StemMediaProvider>
          <span data-testid="child" />
        </StemMediaProvider>
      </WorkflowProvider>,
    );

    expect(useStemLoadingMock).toHaveBeenCalledTimes(1);
    const [options] = useStemLoadingMock.mock.calls[0] ?? [];
    expect(options?.audioContextRef).toBeDefined();
    expect(options?.audioContextRef).toHaveProperty("current");
  });
});
