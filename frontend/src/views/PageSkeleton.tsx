import React from "react";
import { MyStemsPageSkeleton } from "../components/MyStemsPageSkeleton";
import type { AppView } from "../hooks/workflow/useEditorViewRouting";

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

function GenericPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col p-md sm:p-lg">
      <SkeletonPulse className="mb-md h-8 w-48" />
      <SkeletonPulse className="mb-sm h-4 w-full max-w-lg" />
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <SkeletonPulse key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex min-h-screen flex-col gap-md p-md sm:p-lg">
      <div className="flex items-center gap-sm">
        <SkeletonPulse className="h-10 w-10 rounded-xl" />
        <SkeletonPulse className="h-5 w-40" />
      </div>
      <SkeletonPulse className="h-48 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <SkeletonPulse className="h-64 rounded-2xl" />
        <SkeletonPulse className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

const SKELETON_MAP: Record<AppView, () => React.ReactNode> = {
  hub: GenericPageSkeleton,
  editor: EditorSkeleton,
  pricing: GenericPageSkeleton,
  "my-stems": MyStemsPageSkeleton,
  speech: GenericPageSkeleton,
  midi: GenericPageSkeleton,
  beats: GenericPageSkeleton,
  tuner: GenericPageSkeleton,
};

export function PageSkeleton({ view }: { view: AppView }) {
  const Skeleton = SKELETON_MAP[view];
  return <Skeleton />;
}
