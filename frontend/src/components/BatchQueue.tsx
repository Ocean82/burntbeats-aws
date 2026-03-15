import { motion, AnimatePresence } from "framer-motion";
import { X, Music2, Loader2, Check, AlertCircle, Trash2, ChevronUp, ChevronDown } from "lucide-react";

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
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusIcon({ status }: { status: QueueItemStatus }) {
  switch (status) {
    case "queued":
      return <div className="h-3 w-3 rounded-full bg-white/30" />;
    case "processing":
      return <Loader2 className="h-4 w-4 animate-spin text-amber-400" />;
    case "complete":
      return <Check className="h-4 w-4 text-green-400" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-400" />;
  }
}

export function BatchQueue({
  items,
  isExpanded,
  onToggleExpand,
  onRemoveItem,
  onClearCompleted,
  onProcessQueue,
}: BatchQueueProps) {
  if (items.length === 0) return null;

  const processingCount = items.filter((i) => i.status === "processing").length;
  const queuedCount = items.filter((i) => i.status === "queued").length;
  const completedCount = items.filter((i) => i.status === "complete").length;
  const canProcess = queuedCount > 0 && processingCount === 0;

  return (
    <motion.div
      className="fixed bottom-4 right-4 z-40 w-80 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1412]/95 shadow-2xl backdrop-blur-xl"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      layout
    >
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
            <Music2 className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <span className="block text-sm font-medium text-white">
              Batch Queue
            </span>
            <span className="text-xs text-white/65">
              {processingCount > 0
                ? `Processing ${processingCount} of ${items.length}`
                : queuedCount > 0
                ? `${queuedCount} queued`
                : `${completedCount} complete`}
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-white/40" />
        ) : (
          <ChevronUp className="h-4 w-4 text-white/40" />
        )}
      </button>

      {/* Queue Items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto border-t border-white/10">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="group relative border-b border-white/5 px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon status={item.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{item.fileName}</p>
                      <p className="text-xs text-white/40">
                        {formatFileSize(item.fileSize)}
                        {item.status === "processing" && ` • ${item.progress}%`}
                        {item.error && (
                          <span className="text-red-400"> • {item.error}</span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      title="Remove from queue"
                      aria-label={`Remove ${item.fileName} from queue`}
                      className="flex h-6 w-6 items-center justify-center rounded text-white/30 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Progress bar */}
                  {item.status === "processing" && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full bg-amber-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-2">
              {onProcessQueue && (
                <button
                  type="button"
                  onClick={onProcessQueue}
                  disabled={!canProcess}
                  title="Process all queued files"
                  aria-label="Process all queued files"
                  className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-50"
                >
                  Process queue
                </button>
              )}
              {completedCount > 0 && (
                <button
                  onClick={onClearCompleted}
                  className="flex items-center gap-2 text-xs text-white/40 transition hover:text-white"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear completed
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
