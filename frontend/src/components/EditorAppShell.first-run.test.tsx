import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorAppShell } from "./EditorAppShell";
import { markFirstSplitComplete } from "@/api/referral";

const mockAppState = vi.hoisted(() => ({
  splitResultStems: [{ id: "vocals" }],
  splitProgress: 100,
  splitStageLabel: "Complete",
  splitError: null,
}));

vi.mock("@/api/referral", () => ({
  markFirstSplitComplete: vi.fn(),
}));

vi.mock("@/store/appStore", () => ({
  useAppStore: (selector: (state: typeof mockAppState) => unknown) =>
    selector(mockAppState),
}));

vi.mock("./HeaderBar", () => ({
  HeaderBar: () => <div data-testid="header-bar" />,
}));

vi.mock("./PhaseRouter", () => ({
  PhaseRouter: () => <div data-testid="phase-router" />,
}));

vi.mock("@/app/mixer-workspace.component", () => ({
  MixerWorkspace: () => <div data-testid="mixer-workspace" />,
}));

vi.mock("@/components/first-run/FirstRunStepBar", () => ({
  FirstRunStepBar: () => <div data-testid="first-run-step-bar" />,
}));

vi.mock("@/components/first-run/FirstRunExportCue", () => ({
  FirstRunExportCue: () => <div data-testid="first-run-export-cue" />,
}));

const mockedMarkFirstSplitComplete = vi.mocked(markFirstSplitComplete);

describe("EditorAppShell first-run completion", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockedMarkFirstSplitComplete.mockReset();
  });

  it("does not dispatch first-run completion when the server milestone fails", async () => {
    const completionEvents: Event[] = [];
    const onComplete = (event: Event) => completionEvents.push(event);
    window.addEventListener("burntbeats-first-split-complete", onComplete);
    mockedMarkFirstSplitComplete.mockRejectedValueOnce(new Error("network"));

    render(<EditorAppShell firstRunMode />);

    await waitFor(() => {
      expect(mockedMarkFirstSplitComplete).toHaveBeenCalledOnce();
    });
    await Promise.resolve();

    expect(completionEvents).toHaveLength(0);
    expect(sessionStorage.getItem("burnt-beats-first-run-done:user_1")).toBeNull();

    window.removeEventListener("burntbeats-first-split-complete", onComplete);
  });

  it("dispatches first-run completion after the server milestone succeeds", async () => {
    const completionEvents: Event[] = [];
    const onComplete = (event: Event) => completionEvents.push(event);
    window.addEventListener("burntbeats-first-split-complete", onComplete);
    mockedMarkFirstSplitComplete.mockResolvedValueOnce(undefined);

    render(<EditorAppShell firstRunMode />);

    await waitFor(() => {
      expect(completionEvents).toHaveLength(1);
    });

    window.removeEventListener("burntbeats-first-split-complete", onComplete);
  });
});
