import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import "./ui-panel.css";

export interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return <div className={cn("ui-section-label", className)}>{children}</div>;
}
