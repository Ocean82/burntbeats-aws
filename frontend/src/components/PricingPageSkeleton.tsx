/**
 * PricingPageSkeleton — shimmer loading state for the Pricing page.
 * Shown while subscription data loads to prevent layout shift and
 * communicate progress to the user.
 */

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

export function PricingPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col gap-2xl px-sm py-md sm:px-lg lg:px-xl">
      {/* Breadcrumb skeleton */}
      <SkeletonPulse className="h-12 w-full rounded-2xl" />

      {/* Hero skeleton */}
      <section className="glass-panel mirror-sheen rounded-[2rem] px-md py-lg sm:px-lg sm:py-xl lg:px-10">
        <div className="flex flex-col gap-lg lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-sm">
            <SkeletonPulse className="h-4 w-32" />
            <SkeletonPulse className="h-10 w-full max-w-lg" />
            <SkeletonPulse className="h-5 w-full max-w-xl" />
            <SkeletonPulse className="h-5 w-3/4 max-w-lg" />
            <div className="grid gap-xs sm:grid-cols-2">
              <SkeletonPulse className="h-10 rounded-lg" />
              <SkeletonPulse className="h-10 rounded-lg" />
            </div>
            <div className="flex flex-col items-start gap-sm lg:items-end">
              <SkeletonPulse className="h-12 w-full sm:w-64" />
              <SkeletonPulse className="h-10 w-full sm:w-64" />
            </div>
          </div>
        </div>
      </section>

      {/* Plan cards skeleton */}
      <section className="glass-panel rounded-2xl border border-border p-md sm:p-lg">
        <div className="mb-md text-center">
          <SkeletonPulse className="mx-auto mb-1 h-4 w-32" />
          <SkeletonPulse className="mx-auto mb-md h-5 w-full max-w-lg" />
          <div className="mx-auto flex flex-col items-center justify-center gap-sm">
            <SkeletonPulse className="h-8 w-48 rounded-full" />
            <SkeletonPulse className="h-8 w-40 rounded-full" />
          </div>
        </div>
        <div className="grid gap-xs sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <SkeletonPulse key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      </section>

      {/* Feature comparison skeleton */}
      <section className="glass-panel rounded-2xl border border-border p-md sm:p-lg">
        <SkeletonPulse className="mx-auto mb-md h-6 w-48" />
        <div className="grid gap-xs sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonPulse key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </section>

      {/* FAQ skeleton */}
      <section className="grid gap-md rounded-2xl border border-border bg-secondary p-md text-sm sm:grid-cols-2 sm:p-lg">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-xs">
            <SkeletonPulse className="h-4 w-3/4" />
            <SkeletonPulse className="h-4 w-full" />
            <SkeletonPulse className="h-4 w-5/6" />
          </div>
        ))}
      </section>

      {/* Footer skeleton */}
      <SkeletonPulse className="mx-auto h-10 w-48 rounded-xl" />
    </div>
  );
}
