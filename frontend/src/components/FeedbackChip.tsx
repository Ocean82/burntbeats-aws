import { useEffect, useState } from "react";

type Rating = "great" | "ok" | "confusing" | null;

export function FeedbackChip() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<Rating>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("burntbeats:open-feedback", onOpen);
    return () => {
      window.removeEventListener("burntbeats:open-feedback", onOpen);
    };
  }, []);

  const handleSubmit = () => {
    if (!rating && !comment.trim()) return;
    // Placeholder: wire to analytics / backend when ready.
    setOpen(false);
    setRating(null);
    setComment("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-40 rounded-full border border-white/15 bg-black/80 px-4 py-2 text-[11px] font-medium text-white/75 shadow-lg backdrop-blur-md hover:text-white"
      >
        How&apos;s Burnt Beats so far?
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-5 z-40 w-72 rounded-2xl border border-white/15 bg-black/90 p-3 text-[11px] text-white/80 shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold uppercase tracking-[0.18em] text-white/55">
          Quick feedback
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-white/35 hover:text-white"
          aria-label="Close feedback"
        >
          ✕
        </button>
      </div>
      <p className="mb-2 text-[11px] text-white/65">
        Help us make Burnt Beats better. Pick one and (optionally) add a note.
      </p>
      <div className="mb-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => setRating("great")}
          className={`flex-1 rounded-full px-2 py-1 text-[11px] ${
            rating === "great"
              ? "bg-emerald-500/30 text-emerald-100 border border-emerald-400/60"
              : "bg-white/5 text-white/70 border border-white/10"
          }`}
        >
          Great
        </button>
        <button
          type="button"
          onClick={() => setRating("ok")}
          className={`flex-1 rounded-full px-2 py-1 text-[11px] ${
            rating === "ok"
              ? "bg-amber-500/25 text-amber-100 border border-amber-400/60"
              : "bg-white/5 text-white/70 border border-white/10"
          }`}
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => setRating("confusing")}
          className={`flex-1 rounded-full px-2 py-1 text-[11px] ${
            rating === "confusing"
              ? "bg-rose-500/30 text-rose-100 border border-rose-400/60"
              : "bg-white/5 text-white/70 border border-white/10"
          }`}
        >
          Confusing
        </button>
      </div>
      <textarea
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="mb-2 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-amber-400/70"
        placeholder="Optional: what&apos;s working or not?"
      />
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full rounded-full bg-amber-500/80 py-1.5 text-[11px] font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
        disabled={!rating && !comment.trim()}
      >
        Send
      </button>
    </div>
  );
}

