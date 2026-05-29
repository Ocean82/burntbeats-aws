import { cn } from "../../utils/cn";
import "./ui-panel.css";

export type JobStatusChipVariant = "queued" | "running" | "done" | "error";

export interface JobStatusChipProps {
  label: string;
  variant: JobStatusChipVariant;
  className?: string;
}

export function JobStatusChip({ label, variant, className }: JobStatusChipProps) {
  return (
    <span
      className={cn("ui-job-chip", `ui-job-chip--${variant}`, className)}
      role="status"
    >
      {label}
    </span>
  );
}
