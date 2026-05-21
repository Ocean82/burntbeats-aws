import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMidiConvert } from "./useMidiConvert";

vi.mock("../store/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({
      splitResultStems: [],
      loadedStems: [],
    }),
}));

vi.mock("../api/auth", () => ({
  authHeaders: vi.fn().mockResolvedValue({}),
  setJobToken: vi.fn(),
}));

vi.mock("../analytics/events", () => ({
  trackEvent: vi.fn(),
}));

describe("useMidiConvert acceptFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects AAC files with an error", () => {
    const { result } = renderHook(() => useMidiConvert());
    const aac = new File(["x"], "recording.aac", { type: "audio/aac" });

    act(() => {
      result.current.acceptFile(aac);
    });

    expect(result.current.uploadedFile).toBeNull();
    expect(result.current.error).toMatch(/aac/i);
  });

  it("accepts WAV files", () => {
    const { result } = renderHook(() => useMidiConvert());
    const wav = new File(["x"], "stem.wav", { type: "audio/wav" });

    act(() => {
      result.current.acceptFile(wav);
    });

    expect(result.current.uploadedFile).toBe(wav);
    expect(result.current.error).toBeNull();
  });
});
