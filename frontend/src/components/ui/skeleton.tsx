import { cn } from "@/utils/cn"

type SkeletonVariant = "line" | "circle" | "rect" | "waveform"

const variantClass: Record<SkeletonVariant, string> = {
  line: "h-4 w-full",
  circle: "h-10 w-10 rounded-full",
  rect: "h-24 w-full rounded-md",
  waveform: "h-16 w-full rounded-md",
}

function Skeleton({
  variant = "rect",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: SkeletonVariant }) {
  return (
    <div
      className={cn("animate-pulse bg-muted", variantClass[variant], className)}
      {...props}
    />
  )
}

export { Skeleton }
