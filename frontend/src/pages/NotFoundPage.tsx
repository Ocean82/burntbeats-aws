/**
 * NotFoundPage — shown when a user navigates to an invalid URL.
 */
import { AudioWaveform, Home } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)] px-4 text-center text-white">
      {/* Decorative broken waveform */}
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <AudioWaveform className="h-10 w-10 text-amber-400/70" strokeWidth={1.5} />
      </div>

      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">404</h1>
        <p className="text-lg text-white/70">This track doesn't exist.</p>
        <p className="text-sm text-white/45">
          The page you're looking for has been moved, deleted, or never existed.
        </p>
      </div>

      <a
        href="/"
        className="fire-button inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
      >
        <Home className="h-4 w-4" />
        Back to Burnt Beats
      </a>
    </div>
  );
}
