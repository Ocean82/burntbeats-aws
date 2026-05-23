import { useEffect, useState } from "react";
import { useAppEvent } from "../store/eventBus";
import { trackEvent } from "../analytics/events";

type Rating = "great" | "ok" | "confusing" | null;

export function FeedbackChip() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<Rating>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Listen for the typed event bus signal instead of raw DOM events
  useAppEvent("open-feedback", () => setOpen(true));

  // Auto-dismiss the "thank you" confirmation after 4 seconds
  useEffect(() => {
    if (!submitted) return;
    const t = window.setTimeout(() => setSubmitted(false), 4000);
    return () => window.clearTimeout(t);
  }, [submitted]);

  const handleSubmit = () => {
    if (!rating && !comment.trim()) return;
    trackEvent("feedback_submitted", {
      rating: rating ?? "none",
      has_comment: comment.trim().length > 0,
      comment_length: comment.trim().length,
    });
    setOpen(false);
    setRating(null);
    setComment("");
    setSubmitted(true);
  };

  // Show "thank you" confirmation after submission
  if (submitted) {
    return (
      <div className="fixed left-md fixed-bottom-safe z-sticky rounded-full border border-success-400/30 bg-chrome px-md py-xs text-helper font-medium text-success-200 shadow-elevation-md backdrop-blur-md">
        Thanks for the feedback ✓
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-target-expand fixed left-md fixed-bottom-safe z-sticky rounded-full border border-border bg-chrome px-md py-xs text-xs font-medium text-secondary-foreground shadow-elevation-md backdrop-blur-md transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
      >
        How&apos;s Burnt Beats so far?
      </button>
    );
  }

  return (
    <div className="fixed left-md fixed-bottom-safe z-sticky w-72 rounded-2xl border border-border bg-chrome p-sm text-helper text-secondary-foreground shadow-elevation-lg backdrop-blur-md">
      <div className="mb-xs flex items-center justify-between gap-xs">
        <p className="font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Quick feedback
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap-target-expand rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close feedback"
        >
          ✕
        </button>
      </div>
      <p className="mb-xs text-helper text-muted-foreground">
        Help us make Burnt Beats better. Pick one and (optionally) add a note.
      </p>
      <div className="mb-xs flex gap-xs">
        <button
          type="button"
          onClick={() => setRating("great")}
          className={`tap-feedback min-h-[44px] flex-1 rounded-full px-xs py-xs text-xs transition-[color,background-color,transform] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] ${
            rating === "great"
              ? "bg-success-500/30 text-success-100 border border-success-400/60"
              : "bg-muted text-secondary-foreground border border-border hover:bg-secondary"
          }`}
        >
          Great
        </button>
        <button
          type="button"
          onClick={() => setRating("ok")}
          className={`tap-feedback min-h-[44px] flex-1 rounded-full px-xs py-xs text-xs transition-[color,background-color,transform] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] ${
            rating === "ok"
              ? "bg-primary-500/25 text-primary-100 border border-primary-400/60"
              : "bg-muted text-secondary-foreground border border-border hover:bg-secondary"
          }`}
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => setRating("confusing")}
          className={`tap-feedback min-h-[44px] flex-1 rounded-full px-xs py-xs text-xs transition-[color,background-color,transform] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] ${
            rating === "confusing"
              ? "bg-destructive-500/30 text-destructive-100 border border-destructive-400/60"
              : "bg-muted text-secondary-foreground border border-border hover:bg-secondary"
          }`}
        >
          Confusing
        </button>
      </div>
      <textarea
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="mb-xs w-full rounded-md border border-border bg-secondary px-xs py-xs text-sm text-secondary-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Optional: what&apos;s working or not?"
      />
      <button
        type="button"
        onClick={handleSubmit}
        className="tap-feedback min-h-[44px] w-full rounded-full bg-primary-500/80 py-xs text-sm font-semibold text-primary-foreground transition-[background-color,transform] duration-[var(--motion-fast)] hover:bg-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!rating && !comment.trim()}
      >
        Send
      </button>
    </div>
  );
}
