import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ChannelMeter } from "./channel-meter.component";

describe("ChannelMeter", () => {
  it("renders canvas with peak hold and clip LED enabled", () => {
    const getAnalyserData = vi.fn(() => new Uint8Array(2048).fill(128));
    const { container } = render(
      <ChannelMeter
        getAnalyserData={getAnalyserData}
        color="#f59e0b"
        isPlaying
        height={120}
      />,
    );
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it("latches clip LED on hot peak", async () => {
    const hot = new Uint8Array(2048).fill(255);
    const { container } = render(
      <ChannelMeter
        getAnalyserData={() => hot}
        color="#f59e0b"
        isPlaying
        height={120}
      />,
    );

    await waitFor(() => {
      const led = container.querySelector('[role="status"]');
      expect(led?.className).toContain("bg-red-500");
    });
  });
});
