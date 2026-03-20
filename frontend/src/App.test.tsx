import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./app/app-shell.component";
import { App } from "./App";

// Avoid real fetch and ResizeObserver in tests
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve("") }))
  );
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }))
  );
});

describe("App flow", () => {
  it("renders and shows stem splitter UI", () => {
    render(
      <AppShell>
        <App />
      </AppShell>
    );
    expect(screen.getByRole("button", { name: /Split and Generate Stem Rack/i })).toBeInTheDocument();
  });

  it("shows upload and split pipeline copy", () => {
    render(
      <AppShell>
        <App />
      </AppShell>
    );
    const uploadSplit = screen.getAllByText(/Upload|Split/i);
    expect(uploadSplit.length).toBeGreaterThan(0);
  });
});
