import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../utils/cn";

interface MidiLaneDrawerProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function MidiLaneDrawer({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: MidiLaneDrawerProps) {
  return (
    <section className="midi-lane-drawer">
      <button
        type="button"
        className="midi-lane-drawer__header"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div>
          <div className="midi-lane-drawer__title">{title}</div>
          {subtitle ? <div className="midi-lane-drawer__subtitle">{subtitle}</div> : null}
        </div>
        <span className="midi-lane-drawer__chevron" aria-hidden>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>
      <div className={cn("midi-lane-drawer__content", !open && "midi-lane-drawer__content--collapsed")}>
        {open ? children : null}
      </div>
    </section>
  );
}
