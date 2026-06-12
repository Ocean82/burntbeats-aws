/**
 * Brief success animation — green checkmark that fades in/out.
 *
 * Use after completed actions (split done, export done, MIDI convert done)
 * to provide satisfying visual feedback that the operation succeeded.
 */
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "../../utils/cn";

export interface SuccessFlashProps {
  /** Whether to show the flash. Automatically hides after duration. */
  show: boolean;
  /** Duration in ms before auto-hiding. Default: 1200. */
  duration?: number;
  /** Called when the flash finishes and hides. */
  onComplete?: () => void;
  /** Additional CSS classes. */
  className?: string;
}

export function SuccessFlash({
  show,
  duration = 1200,
  onComplete,
  className,
}: SuccessFlashProps) {
  const [visible, setVisible] = useState(false);
  // Stabilize onComplete reference to prevent timer resets on parent re-renders
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onCompleteRef.current?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [show, duration]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center",
        "animate-[successFlash_0.8s_ease-out_forwards]",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Action completed successfully"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/20 ring-2 ring-success/40">
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
      </div>
    </div>
  );
}
