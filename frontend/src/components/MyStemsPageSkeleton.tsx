/**
 * MyStemsPageSkeleton — shimmer loading state for the My Stems page.
 * Replaces the full-screen spinner with skeleton cards for better perceived performance.
 */

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/8 ${className ?? ""}`} />;
}

export function MyStemsPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0d0b09]">
      {/* Header skeleton */}
      <header className="flex items-center gap-3 border-b border-white/10 p-4 sm:p-6">
        <SkeletonPulse className="h-10 w-10 rounded-xl" />
        <SkeletonPulse className="h-5 w-28" />
      </header>

      <main className="flex-1 p-4 sm:p-6">
        {/* Storage overview skeleton */}
        <section className="mb-6 grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-[#1a1412]/95 p-3 sm:p-4"
            >
              <SkeletonPulse className="mb-2 h-3 w-12" />
              <SkeletonPulse className="h-6 w-10" />
            </div>
          ))}
        </section>

        {/* Search & sort skeleton */}
        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SkeletonPulse className="h-10 flex-1 rounded-xl" />
          <SkeletonPulse className="h-10 w-36 rounded-xl" />
        </section>

        {/* Job card skeletons */}
        <section className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-3xl border border-white/10 bg-[#1a1412]/95 p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonPulse className="h-4 w-48 max-w-full" />
                  <div className="flex items-center gap-2">
                    <SkeletonPulse className="h-3 w-20" />
                    <SkeletonPulse className="h-5 w-16 rounded-full" />
                  </div>
                </div>
                <SkeletonPulse className="h-5 w-5 shrink-0 rounded" />
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
