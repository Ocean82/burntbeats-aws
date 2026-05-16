import { memo } from "react";
import { VUMeter } from "../VUMeter";

export interface ChannelMeterProps {
  getAnalyserData: () => Uint8Array | null;
  color: string;
  isPlaying: boolean;
  height?: number;
}

/** Slim per-channel VU meter aligned with the vertical fader. */
export const ChannelMeter = memo(function ChannelMeter({
  getAnalyserData,
  color,
  isPlaying,
  height = 120,
}: ChannelMeterProps) {
  return (
    <VUMeter
      getAnalyserData={getAnalyserData}
      color={color}
      isPlaying={isPlaying}
      height={height}
      width={8}
      showPeakHold
      showClipIndicator
    />
  );
});
