import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MidiSourceSelector } from "./MidiSourceSelector";

const baseProps = {
  sourceMode: "upload" as const,
  onSourceModeChange: vi.fn(),
  selectedStem: null,
  onSelectStem: vi.fn(),
  splitResultStems: [],
  loadedStems: [],
  selectedLoadedStemId: null,
  onSelectLoadedStem: vi.fn(),
  uploadedFile: null,
  uploadName: "",
  onBrowse: vi.fn(),
  onDrop: vi.fn(),
  inputRef: { current: null },
  isDragging: false,
  onSetIsDragging: vi.fn(),
};

describe("MidiSourceSelector", () => {
  it("shows helper text explaining source modes", () => {
    render(<MidiSourceSelector {...baseProps} />);
    expect(screen.getByText(/uses stems from your last server split/i)).toBeInTheDocument();
    expect(screen.getByText(/uses files you loaded in the stem editor/i)).toBeInTheDocument();
    expect(screen.getByText(/is for any local audio/i)).toBeInTheDocument();
  });

  it("calls onDrop when a file is dropped on the upload zone", () => {
    const onDrop = vi.fn();
    render(<MidiSourceSelector {...baseProps} onDrop={onDrop} />);

    const dropzone = screen.getByTestId("midi-upload-dropzone");
    const file = new File(["x"], "test.wav", { type: "audio/wav" });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });

    expect(onDrop).toHaveBeenCalledWith(file);
  });
});
