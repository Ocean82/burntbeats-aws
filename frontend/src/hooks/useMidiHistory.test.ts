import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMidiHistory } from "./useMidiHistory";

const mockAuthHeaders = vi.fn();

vi.mock("../api/auth", () => ({
  authHeaders: (...args: unknown[]) => mockAuthHeaders(...args),
}));

describe("useMidiHistory", () => {
  beforeEach(() => {
    mockAuthHeaders.mockReset();
    mockAuthHeaders.mockResolvedValue({ Authorization: "Bearer owner-token" });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("loads MIDI history records with auth headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          conversions: [
            {
              job_id: "midi-job-1",
              stem_job_id: "stem-job-1",
              stem_name: "vocals",
              notes_detected: 24,
              duration_seconds: 12,
              created_at: "2026-05-25T00:00:00.000Z",
              file_available: true,
            },
          ],
        }),
      }),
    );

    const { result } = renderHook(() => useMidiHistory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockAuthHeaders).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/midi/history",
      { headers: { Authorization: "Bearer owner-token" } },
    );
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0].job_id).toBe("midi-job-1");
  });
});
