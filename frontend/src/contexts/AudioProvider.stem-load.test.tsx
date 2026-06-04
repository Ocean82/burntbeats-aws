import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/appStore";
import { useWorkflowStore } from "../store/workflowStore";

interface StemLoadingMockOptions {
  audioContextRef: typeof sharedAudioContextRef;
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

const sharedAudioContextRef = { current: null as AudioContext | null };

vi.mock("../hooks/useStemLoading", () => ({
  useStemLoading: (options: { audioContextRef: typeof sharedAudioContextRef }) =>
    useStemLoadingMock(options),
}));

vi.mock("../hooks/useAudioPlayback", () => ({
  useAudioPlayback: () => ({
    audioContextRef: sharedAudioContextRef,
    isPlayingMix: false,
    isPlayingMixRef: { current: false },
    playingStem: null,
    loadingPreviewStemId: null,
    playheadPosition: 0,
    getPlayheadPosition: () => 0,
    subscribePlayheadPosition: () => () => {},
    handlePlayMix: vi.fn(),
    handleSeekMix: vi.fn(),
    handleStopMix: vi.fn(),
    handlePreviewStem: vi.fn(),
    stopPreview: vi.fn(),
    getMasterAnalyserTimeDomainData: () => null,
    getMasterAnalyserTimeDomainDataLeft: () => null,
    getMasterAnalyserTimeDomainDataRight: () => null,
    getMasterAnalyserFrequencyData: () => null,
    getStemAnalyserTimeDomainData: () => null,
    masterVolume: 1,
    setMasterVolume: vi.fn(),
    masterLimiterEnabled: false,
    setMasterLimiterEnabled: vi.fn(),
    loopEnabled: false,
    setLoopEnabled: vi.fn(),
  }),
}));

import { WorkflowProvider } from "./WorkflowContext";
import { AudioProvider } from "./AudioContext";

describe("AudioProvider stem loading", () => {
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

  it("invokes useStemLoading once with the playback audioContextRef", () => {
    render(
      <WorkflowProvider>
        <AudioProvider>
          <span data-testid="child" />
        </AudioProvider>
      </WorkflowProvider>,
    );

    expect(useStemLoadingMock).toHaveBeenCalledTimes(1);
    const [options] = useStemLoadingMock.mock.calls[0] ?? [];
    expect(options?.audioContextRef).toBe(sharedAudioContextRef);
  });
});
