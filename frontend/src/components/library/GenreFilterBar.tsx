/**
 * GenreFilterBar — Row of genre toggle buttons for filtering the Pattern Library Panel.
 *
 * Displays an "All" button followed by one button per genre.
 * The active filter is visually distinguished. Parent manages state so
 * the selection persists for the session (until page reload).
 */
import { cn } from "../../utils/cn";

// ─── Props ────────────────────────────────────────────────────────

export interface GenreFilterBarProps {
  genres: Array<{ value: string; label: string }>;
  selected: string; // "all" | genre value
  onSelect: (genre: string) => void;
}

// ─── Component ────────────────────────────────────────────────────

export function GenreFilterBar({ genres, selected, onSelect }: GenreFilterBarProps) {
  const allOptions: Array<{ value: string; label: string }> = [
    { value: "all", label: "All" },
    ...genres,
  ];

  return (
    <div
      role="toolbar"
      aria-label="Filter patterns by genre"
      className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-0.5"
    >
      {allOptions.map((option) => {
        const isActive = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(option.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
              isActive
                ? "bg-primary-500/20 text-primary-200 shadow-sm"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
