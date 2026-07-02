import { Skeleton } from "./ui/skeleton";

/**
 * MyStemsPageSkeleton — shimmer loading state for the My Stems page.
 * Replaces the full-screen spinner with skeleton cards for better perceived performance.
 */

export function MyStemsPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-popover">
      {/* Header skeleton */}
      <header className="flex items-center gap-sm border-b border-border p-md sm:p-lg">
        <Skeleton variant="circle" className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-5 w-28" />
      </header>

      <main className="flex-1 p-md sm:p-lg">
        {/* Storage overview skeleton */}
        <section className="mb-lg grid grid-cols-3 gap-sm">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-popover/95 p-sm sm:p-md"
            >
              <Skeleton variant="line" className="mb-xs h-3 w-12" />
              <Skeleton className="h-6 w-10" />
            </div>
          ))}
        </section>

        {/* Search & sort skeleton */}
        <section className="mb-md flex flex-col gap-sm sm:flex-row sm:items-center">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
        </section>

        {/* Job card skeletons */}
        <section className="space-y-sm">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-3xl border border-border bg-popover/95 p-md sm:p-lg"
            >
              <div className="flex items-center justify-between gap-sm">
                <div className="min-w-0 flex-1 space-y-xs">
                  <Skeleton variant="line" className="h-4 w-48 max-w-full" />
                  <div className="flex items-center gap-xs">
                    <Skeleton variant="line" className="h-3 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-5 w-5 shrink-0 rounded" />
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
