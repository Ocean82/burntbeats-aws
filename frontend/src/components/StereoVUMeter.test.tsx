import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StereoVUMeter } from "./StereoVUMeter";

describe("StereoVUMeter", () => {
  it("shows clip indicator when input is hot", async () => {
    const hot = new Uint8Array(2048).fill(255);
    render(
      <StereoVUMeter
        getAnalyserData={() => hot}
        getAnalyserDataLeft={() => hot}
        getAnalyserDataRight={() => hot}
        isPlaying
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/clip/i)).toBeInTheDocument(),
    );
  });
});
