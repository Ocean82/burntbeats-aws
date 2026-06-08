import { useEffect, useRef } from "react";
import type { EditableNote } from "./editorTypes";

interface MidiContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  note?: EditableNote | null;
  hasSelection: boolean;
  onClose: () => void;
  onDelete: () => void;
  onQuantize: () => void;
  onToggleMute: () => void;
  onChannelChange: (channel: number) => void;
  onLegato: () => void;
  onHumanize: () => void;
}

export function MidiContextMenu({
  open,
  x,
  y,
  note,
  hasSelection,
  onClose,
  onDelete,
  onQuantize,
  onToggleMute,
  onChannelChange,
  onLegato,
  onHumanize,
}: MidiContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="midi-context-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label="Piano roll context menu"
    >
      <div className="midi-context-menu__section">
        <button type="button" className="midi-context-menu__item" onClick={onDelete}>
          Delete
        </button>
        <button
          type="button"
          className="midi-context-menu__item"
          onClick={onQuantize}
          disabled={!hasSelection && !note}
        >
          Quantize
        </button>
      </div>

      <div className="midi-context-menu__section">
        <button
          type="button"
          className="midi-context-menu__item"
          onClick={onToggleMute}
          disabled={!note}
        >
          {note?.muted ? "Unmute note" : "Mute note"}
        </button>
        <label className="midi-context-menu__field">
          <span>Channel</span>
          <select
            value={note?.channel ?? 1}
            onChange={(event) => onChannelChange(Number(event.target.value))}
            disabled={!note}
          >
            {Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => (
              <option key={channel} value={channel}>
                Ch {channel}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="midi-context-menu__section">
        <div className="midi-context-menu__label">Functions</div>
        <button
          type="button"
          className="midi-context-menu__item"
          onClick={onLegato}
          disabled={!hasSelection}
        >
          Legato
        </button>
        <button
          type="button"
          className="midi-context-menu__item"
          onClick={onHumanize}
          disabled={!hasSelection}
        >
          Humanize
        </button>
      </div>
    </div>
  );
}
