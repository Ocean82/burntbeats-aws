import { motion } from "framer-motion";
import { Repeat } from "lucide-react";
import { cn } from "../utils/cn";

interface ComparisonToggleProps {
  isComparing: boolean;
  showingOriginal: boolean;
  onToggle: () => void;
  onSwitch: () => void;
  disabled?: boolean;
}

export function ComparisonToggle({
  isComparing,
  showingOriginal,
  onToggle,
  onSwitch,
  disabled = false,
}: ComparisonToggleProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Toggle comparison mode */}
      <button
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition",
          isComparing
            ? "border-amber-400/50 bg-amber-500/20 text-amber-200"
            : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <Repeat className="h-3.5 w-3.5" />
        A/B Compare
      </button>

      {/* Switch between original and mix */}
      {isComparing && (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "auto" }}
          exit={{ opacity: 0, width: 0 }}
          className="flex overflow-hidden rounded-xl border border-white/10 bg-black/30"
        >
          <button
            onClick={onSwitch}
            className={cn(
              "px-3 py-2 text-xs font-medium transition",
              showingOriginal
                ? "bg-amber-500/20 text-amber-200"
                : "text-white/50 hover:text-white"
            )}
          >
            Original
          </button>
          <button
            onClick={onSwitch}
            className={cn(
              "px-3 py-2 text-xs font-medium transition",
              !showingOriginal
                ? "bg-amber-500/20 text-amber-200"
                : "text-white/50 hover:text-white"
            )}
          >
            Mix
          </button>
        </motion.div>
      )}
    </div>
  );
}
