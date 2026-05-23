/**
 * NotFoundPage — shown when a user navigates to an invalid URL.
 */
import { AudioWaveform, Home } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-lg bg-[var(--bg)] px-md text-center text-foreground">
      {/* Decorative broken waveform */}
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-muted">
        <AudioWaveform className="h-10 w-10 text-primary-400/70" strokeWidth={1.5} />
      </div>

      <div className="space-y-xs">
        <h1 className="text-4xl font-bold tracking-tight">404</h1>
        <p className="text-lg text-secondary-foreground">Page not found</p>
        <p className="text-sm text-muted-foreground">
          This link may be wrong, or the page was removed.
        </p>
      </div>

      <a
        href="/"
        className="fire-button inline-flex items-center gap-xs rounded-xl px-lg py-sm text-sm font-semibold"
      >
        <Home className="h-4 w-4" />
        Back to Burnt Beats
      </a>
    </div>
  );
}
