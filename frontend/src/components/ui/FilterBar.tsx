import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import "./ui-panel.css";

export interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("ui-filter-bar", className)} role="toolbar" aria-label="Filters">
      {children}
    </div>
  );
}
