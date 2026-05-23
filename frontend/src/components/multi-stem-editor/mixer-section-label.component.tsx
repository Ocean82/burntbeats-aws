import { memo } from "react";
import { cn } from "../../utils/cn";

export interface MixerSectionLabelProps {
  children: string;
  className?: string;
}

/** Tiny uppercase section label for mixer channel groups (PAN, VOL, EQ). */
export const MixerSectionLabel = memo(function MixerSectionLabel({
  children,
  className,
}: MixerSectionLabelProps) {
  return (
    <span
      className={cn(
        "mixer-section-label text-meta font-semibold uppercase tracking-[0.12em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
});
