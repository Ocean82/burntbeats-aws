import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLoadHistoryJob } from "./useLoadHistoryJob";

describe("useLoadHistoryJob", () => {
  it("loads only available history stems using canonical file URLs", async () => {
    const onLoaded = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useLoadHistoryJob({ onLoaded, onError }));

    await result.current.loadHistoryJob({
      job_id: "550e8400-e29b-41d4-a716-446655440000",
      status: "completed",
      stems: 2,
      quality: "quality",
      original_filename: "track.wav",
      duration_seconds: 12,
      token_cost: 1,
      model_name: "model",
      created_at: "2026-06-01T00:00:00.000Z",
      completed_at: "2026-06-01T00:00:30.000Z",
      stem_files: [
        {
          stem_name: "vocals",
          s3_key: null,
          file_size_bytes: 1024,
          available: true,
          file_url: "https://example.com/api/stems/file/550e8400-e29b-41d4-a716-446655440000/vocals.wav",
        },
        {
          stem_name: "drums",
          s3_key: null,
          file_size_bytes: 1024,
          available: false,
          file_url: "https://example.com/api/stems/file/550e8400-e29b-41d4-a716-446655440000/drums.wav",
        },
      ],
    });

    await waitFor(() => {
      expect(onLoaded).toHaveBeenCalledWith({
        stems: [
          {
            id: "vocals",
            url: "https://example.com/api/stems/file/550e8400-e29b-41d4-a716-446655440000/vocals.wav",
          },
        ],
        jobId: "550e8400-e29b-41d4-a716-446655440000",
        uploadName: "track.wav",
      });
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports an error when no history stems are available", async () => {
    const onLoaded = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useLoadHistoryJob({ onLoaded, onError }));

    await result.current.loadHistoryJob({
      job_id: "550e8400-e29b-41d4-a716-446655440001",
      status: "completed",
      stems: 1,
      quality: "quality",
      original_filename: "track.wav",
      duration_seconds: 12,
      token_cost: 1,
      model_name: "model",
      created_at: "2026-06-01T00:00:00.000Z",
      completed_at: "2026-06-01T00:00:30.000Z",
      stem_files: [
        {
          stem_name: "vocals",
          s3_key: null,
          file_size_bytes: 1024,
          available: false,
          file_url: "",
        },
      ],
    });

    expect(onLoaded).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("This job has no stems available to load.");
  });
});
