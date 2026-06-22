import {
  Music,
  SlidersHorizontal,
  Timer,
  Volume2,
  Sparkles,
  Brain,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { LAYOUT } from "@/constants/layout";
import type { ToolCategory } from "@/types/tools";

type LucideIcon = React.ComponentType<{ size?: number | string; className?: string } & React.AriaAttributes>;

interface ToolButtonDef {
  id: ToolCategory;
  label: string;
  icon: LucideIcon;
}

const TOOL_BUTTONS: ToolButtonDef[] = [
  { id: "pitch", label: "Pitch", icon: Music },
  { id: "eq", label: "EQ", icon: SlidersHorizontal },
  { id: "timeStretch", label: "Time Stretch", icon: Timer },
  { id: "amplitude", label: "Amplitude", icon: Volume2 },
  { id: "fx", label: "FX", icon: Sparkles },
  { id: "intelligence", label: "Analyze", icon: Brain },
];

export interface ToolSidebarProps {
  activeTool: ToolCategory | null;
  onToolToggle: (tool: ToolCategory) => void;
  /** When true, renders as horizontal toolbar (mobile layout) */
  horizontal?: boolean;
}

/**
 * ToolSidebar — 64px vertical icon bar with 5 tool buttons.
 * At-most-one-active button at any time (controlled by parent via activeTool prop).
 * Remains fixed and does not scroll with timeline content.
 * Below 768px viewport width: collapses to a horizontal toolbar via the `horizontal` prop.
 */
export function ToolSidebar({
  activeTool,
  onToolToggle,
  horizontal = false,
}: ToolSidebarProps) {
  return (
    <nav
      data-testid="tool-sidebar"
      aria-label="Audio tools"
      className={cn(
        "glass-panel flex items-center gap-xs rounded-2xl p-xs",
        horizontal
          ? "flex-row justify-center"
          : "flex-col justify-start",
      )}
      style={
        horizontal
          ? { height: `${LAYOUT.TOOL_SIDEBAR_WIDTH}px` }
          : { width: `${LAYOUT.TOOL_SIDEBAR_WIDTH}px` }
      }
    >
      {TOOL_BUTTONS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTool === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => onToolToggle(id)}
            className={cn(
              "flex items-center justify-center rounded-xl transition-colors duration-150",
              "h-11 w-11 shrink-0",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              isActive
                ? "bg-primary/20 text-primary border border-primary/60"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent",
            )}
          >
            <Icon size={20} aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
