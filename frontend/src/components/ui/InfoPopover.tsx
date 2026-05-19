import { useId, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "../../utils/cn";
import { useModalA11y } from "../../hooks/useModalA11y";

export interface InfoPopoverProps {
  label: string;
  title: string;
  body: string;
  className?: string;
}

/** Accessible (?) help — click/tap popover for mobile and desktop. */
export function InfoPopover({ label, title, body, className }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(open, panelRef, () => setOpen(false));

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-cyan-200"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <HelpCircle className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close help"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-labelledby={titleId}
            className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-xl border border-cyan-400/30 bg-[#0d1218] px-3 py-2.5 text-left shadow-xl sm:left-full sm:top-1/2 sm:mt-0 sm:ml-2 sm:w-72 sm:translate-x-0 sm:-translate-y-1/2"
          >
            <p id={titleId} className="text-xs font-semibold text-cyan-100">
              {title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/65">{body}</p>
          </div>
        </>
      )}
    </span>
  );
}
