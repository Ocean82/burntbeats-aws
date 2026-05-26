import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStemSplitting } from "./useStemSplitting";

const splitStemsMock = vi.fn();
const trackEventMock = vi.fn();
const setUploadStateMock = vi.fn();

let storeState: {
  uploadedFile: File | null;
};

vi.mock("../api", () => ({
  splitStems: (...args: unknown[]) => splitStemsMock(...args),
}));

vi.mock("../analytics/events", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("../store/appStore", () => {
  const useAppStore = ((selector: (state: {
    setUploadState: typeof setUploadStateMock;
  }) => unknown) =>
    selector({
      setUploadState: setUploadStateMock,
    })) as typeof import("../store/appStore").useAppStore;

  useAppStore.getState = () => storeState as ReturnType<
    typeof import("../store/appStore").useAppStore.getState
  >;

  return { useAppStore };
});

describe("useStemSplitting", () => {
  beforeEach(() => {
    splitStemsMock.mockReset();
    trackEventMock.mockReset();
    setUploadStateMock.mockReset();
    storeState = {
      uploadedFile: new File(["stem"], "track.wav", { type: "audio/wav" }),
    };
    splitStemsMock.mockResolvedValue({
      stems: [],
      job_id: "job_new",
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
});
