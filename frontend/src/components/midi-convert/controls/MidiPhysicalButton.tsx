/**
 * Physical-style push button for the MIDI editor chrome.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../../utils/cn";

export type MidiPhysicalButtonVariant = "default" | "play" | "icon" | "tool";

export interface MidiPhysicalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MidiPhysicalButtonVariant;
  pressed?: boolean;
  children: ReactNode;
}

export function MidiPhysicalButton({
  variant = "default",
  pressed,
  className,
  children,
  ...rest
}: MidiPhysicalButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "midi-btn",
        variant === "play" && "midi-btn--play",
        variant === "icon" && "midi-btn--icon",
        variant === "tool" && "midi-btn--tool",
        className,
      )}
      aria-pressed={pressed !== undefined ? pressed : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
