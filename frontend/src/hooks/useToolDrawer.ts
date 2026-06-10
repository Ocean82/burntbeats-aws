import { useCallback, useState } from "react";
import type { ToolCategory, ToolDrawerState } from "@/types/tools";

/**
 * Manages the tool drawer state with an at-most-one-active invariant.
 *
 * - open(tool): activates the given tool, opens the panel.
 * - close(): deactivates any tool, closes the panel.
 * - toggle(tool): if same tool is active → close; if different → switch to it (panel stays open).
 */
export function useToolDrawer(): ToolDrawerState {
  const [activeTool, setActiveTool] = useState<ToolCategory | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((tool: ToolCategory) => {
    setActiveTool(tool);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setActiveTool(null);
    setIsOpen(false);
  }, []);

  const toggle = useCallback((tool: ToolCategory) => {
    setActiveTool((current) => {
      if (current === tool) {
        setIsOpen(false);
        return null;
      }
      setIsOpen(true);
      return tool;
    });
  }, []);

  return { activeTool, isOpen, open, close, toggle };
}
