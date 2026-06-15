/**
 * MidiInspectorSection — collapsible block in the MIDI editor inspector column.
 */
import type { ReactNode } from "react";
import { MidiLaneDrawer } from "./MidiLaneDrawer";

export interface MidiInspectorSectionProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function MidiInspectorSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: MidiInspectorSectionProps) {
  return (
    <MidiLaneDrawer title={title} subtitle={subtitle} open={open} onToggle={onToggle}>
      {children}
    </MidiLaneDrawer>
  );
}
