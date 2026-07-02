import { motion, useReducedMotion } from "framer-motion";
import { alertRevealMotion } from "../../motion/presets";
import { ErrorState } from "../ui/error-state";

export interface SplitErrorAlertProps {
  splitError: string;
  onDismissError: () => void;
  onRetry: () => void;
}

/** Error banner with retry and dismiss actions. */
export function SplitErrorAlert({
  splitError,
  onDismissError,
  onRetry,
}: SplitErrorAlertProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      {...alertRevealMotion(reduceMotion)}
      className="mt-sm"
    >
      <ErrorState
        variant="server"
        title="Couldn't split this track"
        description={splitError}
        onRetry={onRetry}
        action={{ label: "Dismiss", onClick: onDismissError }}
        className="px-md py-sm text-left"
      />
    </motion.div>
  );
}
