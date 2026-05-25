import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMidiConvert } from "./useMidiConvert";

const mockStore = {
  splitResultStems: [],
  loadedStems: [],
};
const mockAuthHeaders = vi.fn();
const mockSetJobToken = vi.fn();

vi.mock("../store/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector(mockStore),
}));

vi.mock("../api/auth", () => ({
  authHeaders: (...args: unknown[]) => mockAuthHeaders(...args),
  setJobToken: (...args: unknown[]) => mockSetJobToken(...args),
}));

vi.mock("../analytics/events", () => ({
  trackEvent: vi.fn(),
}));

describe("useMidiConvert acceptFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.splitResultStems = [];
    mockStore.loadedStems = [];
    mockAuthHeaders.mockReset();
    mockAuthHeaders.mockResolvedValue({ Authorization: "Bearer token-owner" });
    mockSetJobToken.mockReset();
    vi.stubGlobal("fetch", vi.fn());
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

  it("uses the issued job token for status polling and same-session downloads", async () => {
    mockStore.splitResultStems = [{ id: "vocals", url: "/stems/vocals.wav" }];

    const midiBlob = new Blob(["MThd"], { type: "audio/midi" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/midi/convert")) {
        return {
          ok: true,
          json: async () => ({
            job_id: "midi-job-1",
            job_token: "job-token-1",
            file_url: "/api/midi/file/midi-job-1/output.mid",
          }),
        };
      }
      if (url.endsWith("/api/midi/status/midi-job-1")) {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer token-owner",
          "x-job-token": "job-token-1",
        });
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            job_id: "midi-job-1",
            progress: 100,
            result: {
              notes_detected: 4,
              duration_seconds: 2.5,
              tracks: 1,
              inference_time_seconds: 0.4,
              piano_roll_notes: [
                { pitch: 60, start: 0, duration: 1, velocity: 90 },
              ],
              analysis: null,
            },
          }),
        };
      }
      if (url.endsWith("/api/midi/file/midi-job-1/output.mid")) {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer token-owner",
          "x-job-token": "job-token-1",
        });
        return {
          ok: true,
          blob: async () => midiBlob,
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-midi");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const { result } = renderHook(() => useMidiConvert());

    await act(async () => {
      await result.current.triggerConvert("split-job-1");
    });

    await waitFor(() => {
      expect(result.current.result?.notesDetected).toBe(4);
    });

    await act(async () => {
      await result.current.downloadMidi();
    });

    expect(mockSetJobToken).toHaveBeenCalledWith("midi-job-1", "job-token-1");
    expect(createObjectURLSpy).toHaveBeenCalledWith(midiBlob);
    expect(clickSpy).toHaveBeenCalled();
    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-midi");
  });
});
