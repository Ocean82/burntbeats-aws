import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMidiConvert } from "./useMidiConvert";
import type { AppState } from "../store/appStore";
import { trackEvent } from "../analytics/events";

type MockStore = Pick<AppState, "splitResultStems" | "loadedStems">;

const mockStore: MockStore = {
  splitResultStems: [],
  loadedStems: [],
};
const mockAuthHeaders = vi.fn();
const mockSetJobToken = vi.fn();

vi.mock("../store/appStore", () => ({
  useAppStore: <T>(selector: (s: MockStore) => T) =>
    selector(mockStore),
}));

vi.mock("../api/auth", () => ({
  authHeaders: (...args: unknown[]) => mockAuthHeaders(...args),
  setJobToken: (...args: unknown[]) => mockSetJobToken(...args),
}));

vi.mock("../analytics/events", () => ({
  trackEvent: vi.fn(),
}));

function sseUnavailableThenStatus(
  jobId: string,
  statusPayload: Record<string, unknown>,
) {
  return (url: string) => {
    if (url.endsWith(`/api/midi/status/${jobId}/stream`)) {
      return { ok: false };
    }
    if (url.endsWith(`/api/midi/status/${jobId}`)) {
      return {
        ok: true,
        json: async () => statusPayload,
      };
    }
    return null;
  };
}

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
    const completedStatus = {
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
    };
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
      const statusRoute = sseUnavailableThenStatus("midi-job-1", completedStatus)(url);
      if (statusRoute) {
        if (url.endsWith("/api/midi/status/midi-job-1")) {
          expect(init?.headers).toMatchObject({
            Authorization: "Bearer token-owner",
            "x-job-token": "job-token-1",
          });
        }
        return statusRoute;
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

  it("blocks duplicate download while a download is in flight", async () => {
    mockStore.splitResultStems = [{ id: "vocals", url: "/stems/vocals.wav" }];

    const midiBlob = new Blob(["MThd"], { type: "audio/midi" });
    let downloadCalls = 0;
    const completedStatus = {
      status: "completed",
      job_id: "midi-job-dup",
      progress: 100,
      result: {
        notes_detected: 1,
        duration_seconds: 1,
        tracks: 1,
        inference_time_seconds: 0.1,
        piano_roll_notes: [{ pitch: 60, start: 0, duration: 1, velocity: 90 }],
        analysis: null,
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/midi/convert")) {
        return {
          ok: true,
          json: async () => ({
            job_id: "midi-job-dup",
            job_token: "job-token-dup",
            file_url: "/api/midi/file/midi-job-dup/output.mid",
          }),
        };
      }
      const statusRoute = sseUnavailableThenStatus("midi-job-dup", completedStatus)(url);
      if (statusRoute) return statusRoute;
      if (url.endsWith("/api/midi/file/midi-job-dup/output.mid")) {
        downloadCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: true, blob: async () => midiBlob };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { result } = renderHook(() => useMidiConvert());

    await act(async () => {
      await result.current.triggerConvert("split-job-1");
    });

    await waitFor(() => {
      expect(result.current.result?.notesDetected).toBe(1);
    });

    await act(async () => {
      void result.current.downloadMidi();
      void result.current.downloadMidi();
    });

    await waitFor(() => {
      expect(downloadCalls).toBe(1);
    });
  });
});

describe("useMidiConvert cancelBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.splitResultStems = [
      { id: "vocals", url: "/stems/vocals.wav" },
      { id: "drums", url: "/stems/drums.wav" },
    ];
    mockAuthHeaders.mockResolvedValue({ Authorization: "Bearer token-owner" });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("cancels in-flight jobs, marks pending/converting as cancelled, and keeps batch mode", async () => {
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/midi/convert")) {
        const body = init?.body as FormData | undefined;
        const stemName = body?.get("stem_name");
        const jobId =
          stemName === "vocals" ? "batch-job-vocals" : "batch-job-drums";
        const jobToken =
          stemName === "vocals" ? "batch-token-vocals" : "batch-token-drums";
        return {
          ok: true,
          json: async () => ({
            job_id: jobId,
            job_token: jobToken,
            file_url: `/api/midi/file/${jobId}/output.mid`,
          }),
        };
      }
      if (url.endsWith("/stream")) {
        return { ok: false };
      }
      if (url.endsWith("/api/midi/status/batch-job-vocals")) {
        pollCount += 1;
        if (pollCount < 3) {
          return {
            ok: true,
            json: async () => ({
              status: "processing",
              job_id: "batch-job-vocals",
              progress: 20,
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            job_id: "batch-job-vocals",
            progress: 100,
            result: {
              notes_detected: 2,
              duration_seconds: 1,
              tracks: 1,
              inference_time_seconds: 0.2,
              piano_roll_notes: [{ pitch: 60, start: 0, duration: 1, velocity: 90 }],
              analysis: null,
            },
          }),
        };
      }
      if (url.endsWith("/api/midi/status/batch-job-drums")) {
        return {
          ok: true,
          json: async () => ({
            status: "processing",
            job_id: "batch-job-drums",
            progress: 10,
          }),
        };
      }
      if (url.endsWith("/api/midi/jobs/batch-job-vocals") && init?.method === "DELETE") {
        return { ok: true, json: async () => ({}) };
      }
      if (url.endsWith("/api/midi/jobs/batch-job-drums") && init?.method === "DELETE") {
        return { ok: true, json: async () => ({}) };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMidiConvert());

    await act(async () => {
      void result.current.triggerBatchConvert("split-job-1", ["vocals", "drums"]);
    });

    await waitFor(() => {
      expect(result.current.isBatchMode).toBe(true);
      expect(result.current.batchJobs.some((j) => j.status === "converting")).toBe(true);
    });

    await act(async () => {
      await result.current.cancelBatch();
    });

    expect(result.current.isBatchMode).toBe(true);
    expect(result.current.batchJobs).toHaveLength(2);
    expect(
      result.current.batchJobs.every((j) =>
        ["cancelled", "completed"].includes(j.status),
      ),
    ).toBe(true);
    expect(
      result.current.batchJobs.filter((j) => j.status === "cancelled").length,
    ).toBeGreaterThanOrEqual(1);
    expect(trackEvent).toHaveBeenCalledWith(
      "midi_batch_cancelled",
      expect.objectContaining({ in_flight_jobs: expect.any(Number) }),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/api/midi/jobs/") && init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});
