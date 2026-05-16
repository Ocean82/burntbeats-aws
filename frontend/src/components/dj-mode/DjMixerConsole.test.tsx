import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DjMixerConsole } from "./DjMixerConsole";
import type { StemDefinition } from "../../types";
import { defaultStemState } from "../../stem-editor-state";
import type { DjToolSlot } from "../../hooks/useDjToolbarConfig";

const stems: StemDefinition[] = [
  {
    id: "vocals",
    label: "Vocals",
    subtitle: "Lead vocal",
    flavor: "",
    glow: "#ff6b6b",
    glowSoft: "rgba(255,107,107,0.36)",
    waveform: [],
  },
];

const allTools: DjToolSlot[] = [
  { id: "faders", label: "Faders", visible: true },
  { id: "eq", label: "EQ", visible: true },
  { id: "pan", label: "Pan", visible: true },
  { id: "meters", label: "Meters", visible: true },
];

/** Matches production: visibleSlots only includes visible tools. */
const toolsWithoutMeters: DjToolSlot[] = allTools.filter((t) => t.id !== "meters");

describe("DjMixerConsole", () => {
  it("renders pan knob, fader, and meter when tools are enabled", () => {
    render(
      <DjMixerConsole
        stems={stems}
        stemStates={{ vocals: defaultStemState() }}
        activeStemId="vocals"
        playbackReady
        isPlaying={false}
        playingStemId={null}
        visibleTools={allTools}
        getStemAnalyserTimeDomainData={() => new Uint8Array(128)}
        onStemStateChange={() => {}}
        onActiveStemChange={() => {}}
      />,
    );

    expect(screen.getByRole("slider", { name: /vocals pan/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /vocals volume/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/channel clipping|channel level ok/i)).toBeInTheDocument();
  });

  it("hides meter when meters tool is disabled", () => {
    render(
      <DjMixerConsole
        stems={stems}
        stemStates={{ vocals: defaultStemState() }}
        activeStemId="vocals"
        playbackReady
        isPlaying={false}
        playingStemId={null}
        visibleTools={toolsWithoutMeters}
        getStemAnalyserTimeDomainData={() => new Uint8Array(128)}
        onStemStateChange={() => {}}
        onActiveStemChange={() => {}}
      />,
    );

    expect(screen.queryByLabelText(/channel clipping|channel level ok/i)).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /vocals volume/i })).toBeInTheDocument();
  });
});
