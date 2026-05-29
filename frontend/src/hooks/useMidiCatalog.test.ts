import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMidiCatalog } from "./useMidiCatalog";

const mockAuthHeaders = vi.fn();

vi.mock("../api/auth", () => ({
  authHeaders: (...args: unknown[]) => mockAuthHeaders(...args),
}));

const sampleEntry = {
  id: "midi-001",
  title: "Test Progression",
  filename: "test.mid",
  category: {
    type: "progression",
    genre: "rock",
    key: "C major",
    time_signature: "4/4",
    complexity: "beginner",
    tempo: "moderate",
  },
  analysis: {
    estimatedTempo: 120,
    length: 16,
    track_count: 1,
    note_count: 32,
  },
  tags: ["rock"],
};

describe("useMidiCatalog", () => {
  beforeEach(() => {
    mockAuthHeaders.mockReset();
    mockAuthHeaders.mockResolvedValue({ Authorization: "Bearer token" });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("loads catalog entries with auth headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          total: 1,
          offset: 0,
          limit: 50,
          entries: [sampleEntry],
          statistics: { total_entries: 1, by_genre: { rock: 1 } },
        }),
      }),
    );

    const { result } = renderHook(() => useMidiCatalog());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockAuthHeaders).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/catalog/midi"),
      expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
    );
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].id).toBe("midi-001");
  });

  it("debounces search filter updates", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 0,
        offset: 0,
        limit: 50,
        entries: [],
        statistics: { total_entries: 0, by_genre: {} },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMidiCatalog());

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    fetchMock.mockClear();

    await act(async () => {
      result.current.setSearch("blues");
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("q=blues");

    vi.useRealTimers();
  });
});
