import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureReferralFromUrl,
  getStoredReferralCode,
  useReferralAttach,
} from "./useReferralCapture";
import { attachReferralCode } from "../api/referral";

const mockUseAuth = vi.fn();

vi.mock("@clerk/react", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../api/referral", () => ({
  attachReferralCode: vi.fn(),
}));

function setPath(path: string) {
  window.history.replaceState({}, "", path);
}

const mockedAttachReferralCode = vi.mocked(attachReferralCode);

describe("referral capture and attach", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockedAttachReferralCode.mockReset();
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    setPath("/");
  });

  it("captures and attaches a signed-in referral URL during the same mount", async () => {
    mockedAttachReferralCode.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
    });
    setPath("/?ref=abc123");

    renderHook(() => useReferralAttach());

    await waitFor(() => {
      expect(mockedAttachReferralCode).toHaveBeenCalledWith("ABC123");
    });
    expect(getStoredReferralCode()).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("keeps the stored referral code after a retryable attach failure", async () => {
    mockedAttachReferralCode.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    sessionStorage.setItem("burntbeats_referral_code", "ABC123");

    renderHook(() => useReferralAttach());

    await waitFor(() => {
      expect(mockedAttachReferralCode).toHaveBeenCalledWith("ABC123");
    });
    expect(getStoredReferralCode()).toBe("ABC123");
  });

  it("clears an invalid stored referral code after the backend rejects it", async () => {
    mockedAttachReferralCode.mockResolvedValue({
      ok: false,
      status: 400,
      error: "Referral code not found",
    });
    sessionStorage.setItem("burntbeats_referral_code", "BADCODE");

    renderHook(() => useReferralAttach());

    await waitFor(() => {
      expect(mockedAttachReferralCode).toHaveBeenCalledWith("BADCODE");
    });
    expect(getStoredReferralCode()).toBeNull();
  });

  it("normalizes and removes ref from the current URL when capturing", () => {
    setPath("/editor?ref=abc123&checkout=success");

    captureReferralFromUrl();

    expect(getStoredReferralCode()).toBe("ABC123");
    expect(window.location.search).toBe("?checkout=success");
  });
});
