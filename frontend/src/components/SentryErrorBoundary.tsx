import { ErrorBoundary } from "@sentry/react";
import type { ReactNode } from "react";

interface SentryErrorBoundaryProps {
  children: ReactNode;
}

function FallbackUI() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 p-8 text-center">
      <h1 className="text-xl font-semibold text-neutral-200">Something went wrong</h1>
      <p className="max-w-md text-sm text-neutral-400">
        An unexpected error occurred. Please reload the page to try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 rounded-xl border border-neutral-700 bg-neutral-800 px-6 py-2 text-sm font-medium text-neutral-200 transition hover:bg-neutral-700"
      >
        Reload page
      </button>
    </div>
  );
}

export function SentryErrorBoundary({ children }: SentryErrorBoundaryProps) {
  return <ErrorBoundary fallback={<FallbackUI />}>{children}</ErrorBoundary>;
}
