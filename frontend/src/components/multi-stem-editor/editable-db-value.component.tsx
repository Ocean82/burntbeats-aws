import { memo, useCallback, useEffect, useRef, useState } from "react";
import { clampMixerGainDb, formatDb } from "../../utils/mixer-format";
import { cn } from "../../utils/cn";

export interface EditableDbValueProps {
  value: number;
  muted: boolean;
  stemLabel: string;
  disabled?: boolean;
  onChange: (db: number) => void;
  className?: string;
}

export const EditableDbValue = memo(function EditableDbValue({
  value,
  muted,
  stemLabel,
  disabled = false,
  onChange,
  className,
}: EditableDbValueProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled || muted) return;
      setDraft(String(value));
      setEditing(true);
    },
    [disabled, muted, value],
  );

  const commit = useCallback(() => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed)) {
      onChange(clampMixerGainDb(parsed));
    }
    setEditing(false);
  }, [draft, onChange]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (muted) {
    return (
      <span className={cn("font-mono text-[9px] font-semibold text-red-400", className)}>
        MUTE
      </span>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={-20}
        max={6}
        step={0.5}
        value={draft}
        disabled={disabled}
        role="spinbutton"
        aria-label={`${stemLabel} volume in dB`}
        className={cn(
          "w-14 rounded border border-amber-400/40 bg-black/60 px-1 py-0.5 text-center font-mono text-[9px] font-semibold tabular-nums text-white outline-none focus:border-amber-400/70",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onDoubleClick={startEdit}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "font-mono text-[9px] font-semibold tabular-nums cursor-text",
        value > 3 ? "text-amber-300" : "text-white/50",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      aria-label={`${stemLabel} volume ${formatDb(value)} dB, double-click to edit`}
    >
      {formatDb(value)} dB
    </button>
  );
});
