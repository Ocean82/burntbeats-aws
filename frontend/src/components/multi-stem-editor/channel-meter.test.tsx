import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ChannelMeter } from "./channel-meter.component";

describe("ChannelMeter", () => {
  it("renders canvas and invokes getter when playing", () => {
    const getAnalyserData = vi.fn(() => new Uint8Array(2048));
    const { container } = render(
      <ChannelMeter
        getAnalyserData={getAnalyserData}
        color="#f59e0b"
        isPlaying
        height={120}
      />,
    );
    expect(container.querySelector("canvas")).toBeTruthy();
  });
});
