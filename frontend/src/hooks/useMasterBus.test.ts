import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useMasterBus } from "./useMasterBus";

// Enhance the global mock to support gain param scheduling methods
function createMockGainNode() {
  return {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockCompressor() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

let mockGainNodes: ReturnType<typeof createMockGainNode>[];
let mockCompressor: ReturnType<typeof createMockCompressor>;

beforeEach(() => {
  mockGainNodes = [];
  mockCompressor = createMockCompressor();

  // Override the global AudioContext for these tests
  const MockAudioCtx = class {
    currentTime = 0.5;
    state: AudioContextState = "running";
    destination = { connect: vi.fn() };

    createGain() {
      const node = createMockGainNode();
      mockGainNodes.push(node);
      return node;
    }

    createDynamicsCompressor() {
      return mockCompressor;
    }

    resume() {
      return Promise.resolve();
    }

    close() {
      return Promise.resolve();
    }
  };

  vi.stubGlobal("AudioContext", MockAudioCtx);
});

describe("useMasterBus", () => {
  it("initializes with null context and nodes before initAudio", () => {
    const { result } = renderHook(() => useMasterBus());

    expect(result.current.audioContext).toBeNull();
    expect(result.current.gridGainNode).toBeNull();
    expect(result.current.overlayGainNode).toBeNull();
  });

  it("defaults grid volume to 0.8 and overlay volume to 0.6", () => {
    const { result } = renderHook(() => useMasterBus());

    expect(result.current.gridVolume).toBe(0.8);
    expect(result.current.overlayVolume).toBe(0.6);
  });

  it("initAudio creates AudioContext with correct graph topology", () => {
    const { result } = renderHook(() => useMasterBus());

    act(() => {
      result.current.initAudio();
    });

    // Two gain nodes created (grid + overlay)
    expect(mockGainNodes).toHaveLength(2);

    // Compressor is connected to destination
    expect(mockCompressor.connect).toHaveBeenCalled();

    // Both gain nodes connect to compressor
    expect(mockGainNodes[0].connect).toHaveBeenCalledWith(mockCompressor);
    expect(mockGainNodes[1].connect).toHaveBeenCalledWith(mockCompressor);

    // Grid gain defaults to 0.8
    expect(mockGainNodes[0].gain.value).toBe(0.8);
    // Overlay gain defaults to 0.6
    expect(mockGainNodes[1].gain.value).toBe(0.6);
  });

  it("initAudio returns same context on repeated calls", () => {
    const { result } = renderHook(() => useMasterBus());

    let ctx1: AudioContext;
    let ctx2: AudioContext;
    act(() => {
      ctx1 = result.current.initAudio();
    });
    act(() => {
      ctx2 = result.current.initAudio();
    });

    expect(ctx1!).toBe(ctx2!);
    // Only two gain nodes total (not four)
    expect(mockGainNodes).toHaveLength(2);
  });

  it("setGridVolume clamps to [0.0, 1.0] and applies linear ramp", () => {
    const { result } = renderHook(() => useMasterBus());

    act(() => {
      result.current.initAudio();
    });

    // Set valid volume
    act(() => {
      result.current.setGridVolume(0.5);
    });
    expect(result.current.gridVolume).toBe(0.5);
    expect(mockGainNodes[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.5,
      expect.any(Number),
    );

    // Clamp values above 1.0
    act(() => {
      result.current.setGridVolume(1.5);
    });
    expect(result.current.gridVolume).toBe(1.0);

    // Clamp values below 0.0
    act(() => {
      result.current.setGridVolume(-0.3);
    });
    expect(result.current.gridVolume).toBe(0.0);
  });

  it("setOverlayVolume clamps to [0.0, 1.0] and applies linear ramp", () => {
    const { result } = renderHook(() => useMasterBus());

    act(() => {
      result.current.initAudio();
    });

    // Set valid volume
    act(() => {
      result.current.setOverlayVolume(0.3);
    });
    expect(result.current.overlayVolume).toBe(0.3);
    expect(mockGainNodes[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.3,
      expect.any(Number),
    );

    // Clamp values above 1.0
    act(() => {
      result.current.setOverlayVolume(2.0);
    });
    expect(result.current.overlayVolume).toBe(1.0);

    // Clamp values below 0.0
    act(() => {
      result.current.setOverlayVolume(-1.0);
    });
    expect(result.current.overlayVolume).toBe(0.0);
  });

  it("setGridVolume cancels pending scheduled values before ramping", () => {
    const { result } = renderHook(() => useMasterBus());

    act(() => {
      result.current.initAudio();
    });

    act(() => {
      result.current.setGridVolume(0.4);
    });

    expect(mockGainNodes[0].gain.cancelScheduledValues).toHaveBeenCalled();
    expect(mockGainNodes[0].gain.setValueAtTime).toHaveBeenCalled();
  });

  it("handles AudioContext creation failure gracefully", () => {
    // Make AudioContext throw
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("NotAllowedError");
        }
      },
    );

    const { result } = renderHook(() => useMasterBus());

    expect(() => {
      act(() => {
        result.current.initAudio();
      });
    }).toThrow("Failed to create AudioContext");

    // After failure, nodes should remain null
    expect(result.current.audioContext).toBeNull();
    expect(result.current.gridGainNode).toBeNull();
    expect(result.current.overlayGainNode).toBeNull();
  });

  it("volume setters work without error when no AudioContext exists", () => {
    const { result } = renderHook(() => useMasterBus());

    // Should not throw even without initAudio
    act(() => {
      result.current.setGridVolume(0.5);
    });
    expect(result.current.gridVolume).toBe(0.5);

    act(() => {
      result.current.setOverlayVolume(0.3);
    });
    expect(result.current.overlayVolume).toBe(0.3);
  });
});
