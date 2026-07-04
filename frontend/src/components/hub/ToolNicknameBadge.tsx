import { cn } from "@/utils/cn";

export interface ToolNicknameBadgeProps {
  nickname: string;
  className?: string;
}

export function ToolNicknameBadge({ nickname, className }: ToolNicknameBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      aria-label={`Nickname: ${nickname}`}
    >
      {nickname}
    </span>
  );
}
