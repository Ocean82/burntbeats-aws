/**
 * ToastProvider — renders toast notifications in the bottom-right corner.
 * Respects prefers-reduced-motion. Auto-dismisses after configured duration.
 */
import { useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, CheckCircle2, AlertCircle, Info, Undo2 } from "lucide-react";
import { useToastStore, type Toast, type ToastType } from "../store/toastStore";
import { cn } from "../utils/cn";

const ICON_MAP: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  undo: Undo2,
};

const COLOR_MAP: Record<ToastType, string> = {
  success: "border-success-400/40 bg-success-950/90 text-success-100",
  error: "border-destructive-400/40 bg-destructive-950/90 text-destructive-100",
  info: "border-border bg-popover/95 text-secondary-foreground",
  undo: "border-primary-400/40 bg-primary-950/90 text-primary-100",
};

const ICON_COLOR_MAP: Record<ToastType, string> = {
  success: "text-success-400",
  error: "text-destructive-400",
  info: "text-muted-foreground",
  undo: "text-primary-400",
};

function ToastItem({ toast }: { toast: Toast }) {
  const reduceMotion = useReducedMotion();
  const removeToast = useToastStore((s) => s.removeToast);
  const Icon = ICON_MAP[toast.type];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      removeToast(toast.id);
    }, toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, removeToast]);

  return (
    <motion.div
      layout
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 80, scale: 0.95 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 80, scale: 0.95 }}
      transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
      className={cn(
        "pointer-events-auto flex items-center gap-sm rounded-xl border px-md py-sm shadow-elevation-xl backdrop-blur-xl",
        COLOR_MAP[toast.type],
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("h-4 w-4 shrink-0", ICON_COLOR_MAP[toast.type])} aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            removeToast(toast.id);
          }}
          className="shrink-0 rounded-lg border border-border bg-muted px-sm py-1 text-xs font-semibold transition hover:bg-secondary"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => removeToast(toast.id)}
        className="shrink-0 rounded-md p-2xs text-muted-foreground transition hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-5 right-5 z-toast flex max-w-sm flex-col gap-xs"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
