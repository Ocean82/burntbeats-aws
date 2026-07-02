import { render } from "@testing-library/react"
import { fireEvent, screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { PatternPresetBar } from "./PatternPresetBar";
import type { UseBeatMakerReturn } from "../../hooks/useBeatMaker";
import type { UsePatternStorageReturn } from "../../hooks/usePatternStorage";
import type { UseBeatMakerEntitlementsReturn } from "../../hooks/useBeatMakerEntitlements";

function makeBeatMaker(): UseBeatMakerReturn {
  return {
    kit: [],
    pattern: [],
    steps: 16,
    rowStates: [],
    bpm: 120,
    swing: 0,
    playing: false,
    currentStep: -1,
    toggleCell: vi.fn(),
    clearCell: vi.fn(),
    setSteps: vi.fn(),
    clearPattern: vi.fn(),
    loadPreset: vi.fn(),
    setPattern: vi.fn(),
    toggleMute: vi.fn(),
    toggleSolo: vi.fn(),
    setRowVolume: vi.fn(),
    setBpm: vi.fn(),
    setSwing: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as UseBeatMakerReturn;
}

const storage = {
  savedPatterns: [],
  savePattern: vi.fn(),
  deletePattern: vi.fn(),
  renamePattern: vi.fn(),
  exportAll: vi.fn(() => "[]"),
  importPatterns: vi.fn(() => 0),
  syncStatus: "local" as const,
  lastSyncError: null,
} satisfies UsePatternStorageReturn;

const entitlements: UseBeatMakerEntitlementsReturn = {
  limits: {
    maxSavedPatterns: 10,
    unlockedGenres: ["rock", "hip-hop", "edm", "jazz", "latin", "reggae"],
    canUseVariations: true,
    canExportFullMidi: true,
    canCloudSync: false,
    canSharePatterns: false,
    tierLabel: "Basic",
  },
  tier: "basic",
  isSubscribed: true,
  startCheckout: vi.fn(),
};

describe("PatternPresetBar save form", () => {
  it("saves pattern when Save is clicked without blur closing the form first", () => {
    render(
      <PatternPresetBar beatMaker={makeBeatMaker()} storage={storage} entitlements={entitlements} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Save" }));
    fireEvent.change(screen.getByPlaceholderText("Pattern name..."), {
      target: { value: "My Groove" },
    });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(storage.savePattern).toHaveBeenCalledWith(
      "My Groove",
      expect.objectContaining({ name: "My Groove" }),
    );
    expect(screen.queryByPlaceholderText("Pattern name...")).not.toBeInTheDocument();
  });
});
