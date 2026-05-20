import { useEffect, useCallback } from "react";

export type ShortcutAction =
  | "playStop"
  | "solo1"
  | "solo2"
  | "solo3"
  | "solo4"
  | "muteToggle"
  | "soloToggle"
  | "export"
  | "undo"
  | "redo"
  | "loopToggle"
  | "help"
  | "triggerSplit"
  | "escape"
  | "trimStartLeft"
  | "trimStartRight"
  | "trimEndLeft"
  | "trimEndRight"
  | "navEditor"
  | "navSpeech"
  | "navMidi"
  | "navPricing"
  | "navMyStems";

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

export const KEYBOARD_SHORTCUTS: { key: string; modifier?: string; action: ShortcutAction; label: string; description: string }[] = [
  { key: " ", action: "playStop", label: "Space", description: "Play / Stop mix" },
  { key: "1", action: "solo1", label: "1", description: "Solo stem 1 (Vocals)" },
  { key: "2", action: "solo2", label: "2", description: "Solo stem 2 (Drums)" },
  { key: "3", action: "solo3", label: "3", description: "Solo stem 3 (Bass)" },
  { key: "4", action: "solo4", label: "4", description: "Solo stem 4 (Melody)" },
  { key: "m", action: "muteToggle", label: "M", description: "Mute/unmute active stem" },
  { key: "s", action: "soloToggle", label: "S", description: "Solo active stem (exclusive)" },
  { key: "l", action: "loopToggle", label: "L", description: "Toggle loop playback" },
  { key: "e", modifier: "meta", action: "export", label: "Cmd/Ctrl + E", description: "Export master WAV" },
  { key: "e", modifier: "ctrl", action: "export", label: "Cmd/Ctrl + E", description: "Export master WAV" },
  { key: "z", modifier: "meta", action: "undo", label: "Cmd/Ctrl + Z", description: "Undo last change" },
  { key: "z", modifier: "ctrl", action: "undo", label: "Cmd/Ctrl + Z", description: "Undo last change" },
  { key: "y", modifier: "meta", action: "redo", label: "Cmd/Ctrl + Y", description: "Redo last change" },
  { key: "y", modifier: "ctrl", action: "redo", label: "Cmd/Ctrl + Y", description: "Redo last change" },
  { key: "[", action: "trimStartLeft", label: "[", description: "Move trim start left (expand)" },
  { key: "]", action: "trimStartRight", label: "]", description: "Move trim start right (contract)" },
  { key: "Shift+[", action: "trimEndLeft", label: "Shift + [", description: "Move trim end left (contract)" },
  { key: "Shift+]", action: "trimEndRight", label: "Shift + ]", description: "Move trim end right (expand)" },
  { key: "?", action: "help", label: "?", description: "Show keyboard shortcuts" },
  { key: "Enter", modifier: "ctrl", action: "triggerSplit", label: "Ctrl + Enter", description: "Start stem split" },
  { key: "Enter", modifier: "meta", action: "triggerSplit", label: "Cmd + Enter", description: "Start stem split" },
  { key: "Escape", action: "escape", label: "Esc", description: "Close modal / Stop playback" },
  { key: "1", modifier: "alt", action: "navEditor", label: "Alt + 1", description: "Go to Stem Editor" },
  { key: "2", modifier: "alt", action: "navSpeech", label: "Alt + 2", description: "Go to Speech Clean" },
  { key: "3", modifier: "alt", action: "navMidi", label: "Alt + 3", description: "Go to MIDI Convert" },
  { key: "4", modifier: "alt", action: "navPricing", label: "Alt + 4", description: "Go to Plans" },
  { key: "5", modifier: "alt", action: "navMyStems", label: "Alt + 5", description: "Go to My Stems" },
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
      const hasShift = event.shiftKey;

      for (const shortcut of KEYBOARD_SHORTCUTS) {
        const action = shortcut.action as ShortcutAction;
        // Handle Shift-modified shortcuts
        if (shortcut.key.includes("shift+")) {
          const baseKey = shortcut.key.replace("shift+", "").toLowerCase();
          if (key === baseKey && hasShift && !hasModifier && handlers[action]) {
            event.preventDefault();
            handlers[action]!();
            return;
          }
          continue;
        }
        
        const keyMatches = shortcut.key.toLowerCase() === key || shortcut.key === event.key;
        const modifierMatches =
          (!shortcut.modifier && !hasModifier && !event.altKey) ||
          (shortcut.modifier === "meta" && event.metaKey) ||
          (shortcut.modifier === "ctrl" && event.ctrlKey) ||
          (shortcut.modifier === "alt" && event.altKey);

        if (keyMatches && modifierMatches && handlers[action]) {
          event.preventDefault();
          handlers[action]!();
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
