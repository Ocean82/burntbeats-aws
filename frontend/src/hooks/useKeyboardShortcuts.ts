import { useEffect, useCallback } from "react";

export type ShortcutAction =
  | "playStop"
  | "solo1"
  | "solo2"
  | "solo3"
  | "solo4"
  | "muteToggle"
  | "export"
  | "undo"
  | "redo"
  | "help"
  | "escape";

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

export const KEYBOARD_SHORTCUTS: { key: string; modifier?: string; action: ShortcutAction; label: string; description: string }[] = [
  { key: " ", action: "playStop", label: "Space", description: "Play / Stop mix" },
  { key: "1", action: "solo1", label: "1", description: "Solo stem 1 (Vocals)" },
  { key: "2", action: "solo2", label: "2", description: "Solo stem 2 (Drums)" },
  { key: "3", action: "solo3", label: "3", description: "Solo stem 3 (Bass)" },
  { key: "4", action: "solo4", label: "4", description: "Solo stem 4 (Melody)" },
  { key: "m", action: "muteToggle", label: "M", description: "Mute/unmute selected stem" },
  { key: "e", modifier: "meta", action: "export", label: "Cmd/Ctrl + E", description: "Export master WAV" },
  { key: "e", modifier: "ctrl", action: "export", label: "Cmd/Ctrl + E", description: "Export master WAV" },
  { key: "z", modifier: "meta", action: "undo", label: "Cmd/Ctrl + Z", description: "Undo last change" },
  { key: "z", modifier: "ctrl", action: "undo", label: "Cmd/Ctrl + Z", description: "Undo last change" },
  { key: "y", modifier: "meta", action: "redo", label: "Cmd/Ctrl + Y", description: "Redo last change" },
  { key: "y", modifier: "ctrl", action: "redo", label: "Cmd/Ctrl + Y", description: "Redo last change" },
  { key: "?", action: "help", label: "?", description: "Show keyboard shortcuts" },
  { key: "Escape", action: "escape", label: "Esc", description: "Close modal / Stop playback" },
];

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      
      // Ignore if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;

      for (const shortcut of KEYBOARD_SHORTCUTS) {
        const keyMatches = shortcut.key.toLowerCase() === key || shortcut.key === event.key;
        const modifierMatches =
          (!shortcut.modifier && !hasModifier) ||
          (shortcut.modifier === "meta" && event.metaKey) ||
          (shortcut.modifier === "ctrl" && event.ctrlKey);

        if (keyMatches && modifierMatches && handlers[shortcut.action]) {
          event.preventDefault();
          handlers[shortcut.action]!();
          return;
        }
      }
    },
    [handlers, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
