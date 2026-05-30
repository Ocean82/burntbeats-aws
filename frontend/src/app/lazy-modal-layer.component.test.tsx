import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LazyModalLayer } from "./lazy-modal-layer.component";

describe("LazyModalLayer", () => {
  it("renders nothing when all modal flags are false", () => {
    const { container } = render(
      <LazyModalLayer
        showHelpModal={false}
        showExportModal={false}
        showPresetsModal={false}
        closeModal={vi.fn()}
        handleExportFromModal={vi.fn()}
        isExporting={false}
        mixStemsLength={0}
        exportAllowStemBundleTargets={false}
        isSample={false}
        exportTrackDurationSec={0}
        splitJobId={null}
        handleLoadPreset={vi.fn()}
        mixerState={{}}
        trimMap={{}}
        mutedStems={{}}
        pitchMap={{}}
        timeStretchMap={{}}
        fadeMap={{}}
        batchQueue={[]}
        batchQueueExpanded={false}
        setBatchQueueExpanded={vi.fn()}
        removeFromBatchQueue={vi.fn()}
        clearCompletedFromQueue={vi.fn()}
        canUseBatchQueue={false}
        processNextInQueue={vi.fn(async () => {})}
        splitQuality="quality"
        setUploadState={vi.fn()}
        setSplitError={vi.fn()}
      />,
    );

    expect(container).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
