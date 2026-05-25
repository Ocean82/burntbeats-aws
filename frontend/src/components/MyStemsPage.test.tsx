import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MyStemsPage } from "./MyStemsPage";

const mockToast = vi.fn();
const mockAuthHeaders = vi.fn();

let midiRecords = [
  {
    job_id: "midi-job-1",
    stem_job_id: "job-1",
    stem_name: "vocals",
    notes_detected: 24,
    duration_seconds: 12,
    created_at: "2026-05-25T00:00:00.000Z",
    file_available: true,
  },
];

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: PropsWithChildren<ComponentPropsWithoutRef<"div">>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: PropsWithChildren) => <>{children}</>,
  useReducedMotion: () => false,
}));

vi.mock("../hooks/useStemHistory", () => ({
  useStemHistory: () => ({
    jobs: [
      {
        job_id: "job-1",
        original_filename: "song.wav",
        created_at: "2026-05-25T00:00:00.000Z",
        quality: "quality",
        stem_files: [
          {
            stem_name: "vocals",
            file_size_bytes: 1024,
            s3_key: "stems/job-1/vocals.wav",
          },
        ],
      },
    ],
    isLoading: false,
    error: null,
    totalJobs: 1,
    totalStems: 1,
    totalStorageBytes: 1024,
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/useMidiHistory", () => ({
  useMidiHistory: () => ({
    records: midiRecords,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../api/stemHistory", () => ({
  fetchStemDownloadUrl: vi.fn(),
}));

vi.mock("../api/auth", () => ({
  authHeaders: (...args: unknown[]) => mockAuthHeaders(...args),
}));

vi.mock("../utils/downloadHelper", () => ({
  downloadBlob: vi.fn(),
  isTouchDevice: () => false,
}));

vi.mock("../store/toastStore", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("MyStemsPage MIDI history actions", () => {
  beforeEach(() => {
    midiRecords = [
      {
        job_id: "midi-job-1",
        stem_job_id: "job-1",
        stem_name: "vocals",
        notes_detected: 24,
        duration_seconds: 12,
        created_at: "2026-05-25T00:00:00.000Z",
        file_available: true,
      },
    ];
    mockToast.mockReset();
    mockAuthHeaders.mockReset();
    mockAuthHeaders.mockResolvedValue({ Authorization: "Bearer token-owner" });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("disables MIDI download when the history record is not downloadable", () => {
    midiRecords = [
      {
        job_id: "midi-job-1",
        stem_job_id: "job-1",
        stem_name: "vocals",
        notes_detected: 24,
        duration_seconds: 12,
        created_at: "2026-05-25T00:00:00.000Z",
        file_available: false,
      },
    ];

    render(<MyStemsPage onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /song\.wav/i }));

    expect(
      screen.getByRole("button", { name: /download midi for vocals/i }),
    ).toBeDisabled();
  });

  it("shows an access-specific toast when MIDI download is forbidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }),
    );

    render(<MyStemsPage onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /song\.wav/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /download midi for vocals/i }),
    );

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        "You do not have access to this MIDI file",
        { type: "error" },
      );
    });
  });
});
