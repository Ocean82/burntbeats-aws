import { render } from "@testing-library/react"
import { fireEvent, screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { MidiAnalysisSummary } from "../MidiAnalysisSummary";
import type { MidiAnalysis } from "../../../hooks/useMidiConvert";

const analysis: MidiAnalysis = {
  suggested_bpm: 128,
  estimated_key: "C major",
  scale: "major",
  note_density: 4.2,
  complexity_score: 0.4,
  total_notes: 42,
  pitch_range: {
    min: 48,
    max: 72,
    min_name: "C3",
    max_name: "C5",
  },
};

describe("MidiAnalysisSummary", () => {
  it("calls editor and re-convert BPM handlers separately", () => {
    const onApplyEditorBpm = vi.fn();
    const onApplyReconvertBpm = vi.fn();

    render(
      <MidiAnalysisSummary
        analysis={analysis}
        notesDetected={42}
        onApplyEditorBpm={onApplyEditorBpm}
        onApplyReconvertBpm={onApplyReconvertBpm}
      />,
    );

    fireEvent.click(screen.getByTestId("midi-apply-editor-bpm"));
    fireEvent.click(screen.getByTestId("midi-apply-reconvert-bpm"));

    expect(onApplyEditorBpm).toHaveBeenCalledWith(128);
    expect(onApplyReconvertBpm).toHaveBeenCalledWith(128);
  });
});
