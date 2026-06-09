import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DevHealthPanel } from "./dev-health-panel.component";

const healthPayload = {
  status: "ok",
  uptime_seconds: 120,
  database: { connected: true, latencyMs: 12 },
  services: {
    stem: { reachable: true, status: "ok" },
    speech: { reachable: true, status: "ok" },
    midi: { reachable: true, status: "ok" },
  },
  storage: {
    midi_shared: { aligned: true },
  },
  catalogs: {
    midi: {
      status: "ok",
      total_entries: 12,
      valid_files: 12,
      issue_count: 0,
      issues: [],
      generated_at: "2026-06-07T16:38:45.000Z",
    },
  },
};

describe("DevHealthPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => healthPayload,
      }),
    );
  });

  it("loads and renders backend health data", async () => {
    render(<DevHealthPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: /internal health panel/i }),
      ).toBeInTheDocument();
    });

    expect(await screen.findByText(/12\/12 valid files/i)).toBeInTheDocument();
    expect(screen.getByText(/backend/i)).toBeInTheDocument();
    expect(screen.getByText(/database/i)).toBeInTheDocument();
  });

  it("toggles panel visibility", async () => {
    render(<DevHealthPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /hide internal health panel/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /hide internal health panel/i }),
    );

    expect(
      screen.getByRole("button", { name: /show internal health panel/i }),
    ).toBeInTheDocument();
  });
});
