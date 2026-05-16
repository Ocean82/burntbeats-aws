import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { VUMeter } from "./VUMeter";

describe("VUMeter", () => {
  it("shows clip indicator when peak exceeds threshold", async () => {
    const hot = new Uint8Array(2048).fill(255);
    const { container } = render(
      <VUMeter
        getAnalyserData={() => hot}
        color="#22c55e"
        isPlaying
        showClipIndicator
      />,
    );

    await waitFor(() => {
      const led = container.querySelector('[role="status"]');
      expect(led?.className).toContain("bg-red-500");
    });
  });
});
