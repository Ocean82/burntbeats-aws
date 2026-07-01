import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { collapseMotion, panelEnterMotion } from "../motion/presets";
import { X, Music2, Loader2, Check, AlertCircle, Trash2, ChevronUp, ChevronDown, Lock } from "lucide-react";
import { cn } from "../utils/cn";

export type QueueItemStatus = "queued" | "processing" | "complete" | "error";

export interface QueueItem {
  id: string;
  fileName: string;
  fileSize: number;
  status: QueueItemStatus;
  progress: number;
  error?: string;
}

interface BatchQueueProps {
  items: QueueItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRemoveItem: (id: string) => void;
  onClearCompleted: () => void;
  onProcessQueue?: () => void;
  /** When false (e.g. Basic plan), Process queue is disabled — Premium+ feature */
  allowProcess?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusIcon({ status }: { status: QueueItemStatus }) {
  switch (status) {
    case "queued":
      return <div className="h-3 w-3 rounded-full bg-muted-foreground/50" />;
    case "processing":
      return <Loader2 className="h-4 w-4 animate-spin text-primary-400" />;
    case "complete":
      return <Check className="h-4 w-4 text-success-400" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive-400" />;
  }
}

function statusEdgeClass(status: QueueItemStatus): string {
  switch (status) {
    case "queued":
      return "border-l-muted-foreground/30";
    case "processing":
      return "border-l-primary-400/60";
    case "complete":
      return "border-l-success-400/60";
    case "error":
      return "border-l-destructive-400/60";
  }
}

export function BatchQueue({
  items,
  isExpanded,
  onToggleExpand,
  onRemoveItem,
  onClearCompleted,
  onProcessQueue,
  allowProcess = true,
}: BatchQueueProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const panelEnter = panelEnterMotion(reduceMotion);
  const collapse = collapseMotion(reduceMotion);

  if (items.length === 0) return null;

  const processingCount = items.filter((i) => i.status === "processing").length;
  const queuedCount = items.filter((i) => i.status === "queued").length;
  const completedCount = items.filter((i) => i.status === "complete").length;
  const canProcess = queuedCount > 0 && processingCount === 0 && allowProcess;

  return (
    <motion.div
      className="fixed right-md z-sticky w-[min(100vw-2rem,20rem)] overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-elevation-xl backdrop-blur-xl fixed-bottom-safe"
      {...panelEnter}
      layout={!reduceMotion}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-controls="batch-queue-items"
        className="flex w-full items-center justify-between px-md py-sm text-left transition hover:bg-muted"
      >
        <div className="flex items-center gap-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/20">
            <Music2 className="h-4 w-4 text-primary-400" />
          </div>
          <div>
            <span className="block text-sm font-medium text-foreground">
              Batch Queue
            </span>
            <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {processingCount > 0
                ? `Processing ${processingCount} of ${items.length}`
                : queuedCount > 0
                ? `${queuedCount} queued`
                : `${completedCount} complete`}
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Queue Items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div {...collapse}>
            <div id="batch-queue-items" className="max-h-64 overflow-y-auto border-t border-border">
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { delay: index * 0.04, duration: 0.2 }}
                  className={cn(
                    "group relative border-b border-border px-md py-sm last:border-b-0 border-l-[3px]",
                    statusEdgeClass(item.status),
                    item.status === "complete" && "bg-success-500/[0.03]",
                    item.status === "error" && "bg-destructive-500/[0.04]",
                  )}
                >
                  <div className="flex items-center gap-sm">
                    <StatusIcon status={item.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{item.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(item.fileSize)}
                        {item.status === "processing" && ` • ${item.progress}%`}
                        {item.error && (
                          <span className="text-readable text-destructive-400"> • {item.error}</span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      title="Remove from queue"
                      aria-label={`Remove ${item.fileName} from queue`}
                      className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground opacity-80 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Progress bar */}
                  {item.status === "processing" && (
                    <div
                      className="mt-xs h-1 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${item.fileName} progress`}
                      aria-valuetext={`${item.fileName}: ${Math.max(0, Math.min(100, Math.round(Number(item.progress) || 0)))}% complete`}
                    >
                      <motion.div
                        className="h-full bg-primary-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, Math.min(100, Number(item.progress) || 0))}%` }}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center gap-xs border-t border-border px-md py-xs">
              {onProcessQueue && (
                <button
                  type="button"
                  onClick={onProcessQueue}
                  disabled={!canProcess}
                  title={allowProcess ? "Process all queued files" : "Requires Premium or Studio"}
                  aria-label="Process all queued files"
                  className="tap-feedback min-h-[44px] rounded-lg bg-primary-500/20 px-sm py-xs text-xs font-medium text-primary-200 transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-primary-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2xs">
                    Process queue
                    {!allowProcess && <Lock className="h-3 w-3 text-primary-200/70" aria-hidden="true" />}
                  </span>
                </button>
              )}
              {completedCount > 0 && (
                <button
                  type="button"
                  onClick={onClearCompleted}
                  className="tap-feedback flex min-h-[44px] items-center gap-xs rounded-lg px-xs py-xs text-xs text-muted-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear completed
                </button>
              )}
              {!allowProcess && (
                <p className="w-full text-helper leading-snug text-primary-100/85">
                  Upgrade to Premium or Studio to process all queued tracks in one go.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
