import type { ReactNode } from "react";

export interface HubHeaderProps {
  firstName: string;
  children?: ReactNode;
}

export function HubHeader({
  firstName,
  children,
}: HubHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-2">
          Welcome back, {firstName}
        </h1>
        <p className="text-muted-foreground text-lg">
          What are you creating today?
        </p>
      </div>

      {children && <div className="flex items-center gap-4">{children}</div>}
    </div>
  );
}
