import { memo } from "react";
import { VUMeter, type VUMeterColorMode } from "../VUMeter";

export interface ChannelMeterProps {
  getAnalyserData: () => Uint8Array | null;
  color: string;
  isPlaying: boolean;
  height?: number;
  width?: number;
  colorMode?: VUMeterColorMode;
}

/** Slim per-channel VU meter aligned with the vertical fader. */
export const ChannelMeter = memo(function ChannelMeter({
  getAnalyserData,
  color,
  isPlaying,
  height = 120,
  width = 8,
  colorMode = "stem",
}: ChannelMeterProps) {
  return (
    <VUMeter
      getAnalyserData={getAnalyserData}
      color={color}
      isPlaying={isPlaying}
      height={height}
      width={width}
      colorMode={colorMode}
      showPeakHold
      showClipIndicator
    />
  );
});
