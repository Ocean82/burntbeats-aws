import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStemSplitting } from "./useStemSplitting";

const splitStemsMock = vi.fn();
const expandStemsMock = vi.fn();
const trackEventMock = vi.fn();
const setUploadStateMock = vi.fn();
const setSplitErrorMock = vi.fn();

let storeState: {
  uploadedFile: File | null;
  splitJobId: string | null;
  splitResultStems: Array<{ id: string; url: string }>;
};

vi.mock("../api", () => ({
  splitStems: (...args: unknown[]) => splitStemsMock(...args),
  expandStems: (...args: unknown[]) => expandStemsMock(...args),
}));

vi.mock("../analytics/events", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("../store/appStore", () => {
  const useAppStore = ((selector: (state: {
    setUploadState: typeof setUploadStateMock;
    setSplitError: typeof setSplitErrorMock;
  }) => unknown) =>
    selector({
      setUploadState: setUploadStateMock,
      setSplitError: setSplitErrorMock,
    })) as typeof import("../store/appStore").useAppStore;

  useAppStore.getState = () => storeState as ReturnType<
    typeof import("../store/appStore").useAppStore.getState
  >;

  return { useAppStore };
});

describe("useStemSplitting", () => {
  beforeEach(() => {
    splitStemsMock.mockReset();
    expandStemsMock.mockReset();
    trackEventMock.mockReset();
    setUploadStateMock.mockReset();
    setSplitErrorMock.mockReset();
    storeState = {
      uploadedFile: new File(["stem"], "track.wav", { type: "audio/wav" }),
      splitJobId: "job_123",
      splitResultStems: [
        { id: "vocals", url: "/vocals.wav" },
        { id: "instr", url: "/instr.wav" },
      ],
    };
    splitStemsMock.mockResolvedValue({
      stems: [],
      job_id: "job_new",
    });
    expandStemsMock.mockResolvedValue({
      stems: [],
      job_id: "job_expanded",
    });
  });

  it("downgrades 4-stem split requests when server capabilities disallow them", async () => {
    const { result } = renderHook(() =>
      useStemSplitting({
        subscription: {
          status: "active",
          plan: "unknown",
          entitlementSource: "subscription",
          capabilities: {
            canSplitFourStems: false,
            canExpandToFourStems: false,
            canUsePremiumStemQualities: false,
            canUseBatchQueue: false,
          },
          billingError: null,
          startCheckout: vi.fn(),
          openPortal: vi.fn(),
          refetch: vi.fn(),
        },
        stopPreview: vi.fn(),
        splitQuality: "speed",
        canSplitFourStems: false,
        canExpandToFourStems: false,
        canUsePremiumStemQualities: false,
      }),
    );

    await act(async () => {
      await result.current.triggerSplit(4, false);
    });

    expect(splitStemsMock).toHaveBeenCalledWith(
      expect.any(File),
      "2",
      "speed",
      false,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("blocks expand when the server says 4-stem expand is unavailable", async () => {
    const { result } = renderHook(() =>
      useStemSplitting({
        subscription: {
          status: "active",
          plan: "basic",
          entitlementSource: "usage_tokens",
          capabilities: {
            canSplitFourStems: false,
            canExpandToFourStems: false,
            canUsePremiumStemQualities: false,
            canUseBatchQueue: false,
          },
          billingError: null,
          startCheckout: vi.fn(),
          openPortal: vi.fn(),
          refetch: vi.fn(),
        },
        stopPreview: vi.fn(),
        splitQuality: "speed",
        canSplitFourStems: false,
        canExpandToFourStems: false,
        canUsePremiumStemQualities: false,
      }),
    );

    await act(async () => {
      await result.current.triggerExpand();
    });

    expect(setSplitErrorMock).toHaveBeenCalledWith(
      "4-stem expand requires Premium or Studio.",
    );
    expect(expandStemsMock).not.toHaveBeenCalled();
  });
});
