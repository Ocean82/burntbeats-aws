/**
 * useBatchQueue — manages the batch processing queue.
 * Extracted from App.tsx.
 */
import { useCallback, useRef, useState } from "react";
import { splitStems, type SplitQuality } from "../api";
import type { StemResult } from "../types";
import type { QueueItemStatus } from "../components";

export interface QueueItem {
  id: string;
  fileName: string;
  fileSize: number;
  status: QueueItemStatus;
  progress: number;
  error?: string;
}

interface UseBatchQueueReturn {
  batchQueue: QueueItem[];
  batchQueueExpanded: boolean;
  setBatchQueueExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  addToBatchQueue: (file: File | null) => void;
  removeFromBatchQueue: (id: string) => void;
  clearCompletedFromQueue: () => void;
  processNextInQueue: (
    stemCount: 2 | 4,
    splitQuality: SplitQuality,
    onStemsReady: (stems: StemResult[]) => void,
    onError: (msg: string) => void,
    onJobId?: (jobId: string) => void
  ) => Promise<void>;
}

export function useBatchQueue(): UseBatchQueueReturn {
  const [batchQueue, setBatchQueue] = useState<QueueItem[]>([]);
  const [batchQueueExpanded, setBatchQueueExpanded] = useState(false);
  const queueFileRef = useRef<Map<string, File>>(new Map());
  // Mirror of batchQueue for reading inside async loops without stale closure
  const queueRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);
  const processingPromiseRef = useRef<Promise<void> | null>(null);

  const updateQueue = useCallback((updater: (q: QueueItem[]) => QueueItem[]) => {
    setBatchQueue((q) => {
      const next = updater(q);
      queueRef.current = next;
      return next;
    });
  }, []);

  const addToBatchQueue = useCallback((file: File | null) => {
    if (!file) return;
    const id = crypto.randomUUID();
    updateQueue((q) => [...q, { id, fileName: file.name, fileSize: file.size, status: "queued" as const, progress: 0 }]);
    queueFileRef.current.set(id, file);
  }, [updateQueue]);

  const removeFromBatchQueue = useCallback((id: string) => {
    queueFileRef.current.delete(id);
    updateQueue((q) => q.filter((item) => item.id !== id));
  }, [updateQueue]);

  const clearCompletedFromQueue = useCallback(() => {
    updateQueue((q) => q.filter((item) => item.status !== "complete"));
  }, [updateQueue]);

  const processNextInQueue = useCallback(async (
    stemCount: 2 | 4,
    splitQuality: SplitQuality,
    onStemsReady: (stems: StemResult[]) => void,
    onError: (msg: string) => void,
    onJobId?: (jobId: string) => void
  ) => {
    // Serialize concurrent calls: if already processing, wait for that to finish first
    if (processingPromiseRef.current) {
      await processingPromiseRef.current;
    }
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const promise = (async () => {
      // Auto-advance: process all queued items sequentially
      while (true) {
        const queued = queueRef.current.find((i) => i.status === "queued");
        if (!queued) break;

        const file = queueFileRef.current.get(queued.id);
        if (!file) {
          updateQueue((q) => q.filter((i) => i.id !== queued.id));
          continue;
        }

        updateQueue((q) => q.map((i) => i.id === queued.id ? { ...i, status: "processing" as const, progress: 0 } : i));
        try {
          const res = await splitStems(file, String(stemCount) as "2" | "4", splitQuality, (status) => {
            updateQueue((q) => q.map((i) => i.id === queued.id ? { ...i, progress: status.progress } : i));
          });
          updateQueue((q) => q.map((i) => i.id === queued.id ? { ...i, status: "complete" as const, progress: 100 } : i));
          onStemsReady(res.stems);
          if (res.job_id && onJobId) onJobId(res.job_id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Split failed";
          updateQueue((q) => q.map((i) => i.id === queued.id ? { ...i, status: "error" as const, error: msg } : i));
          onError(msg);
        } finally {
          queueFileRef.current.delete(queued.id);
        }
      }
    })();

    processingPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      isProcessingRef.current = false;
      processingPromiseRef.current = null;
    }
  }, [updateQueue]);

  return { batchQueue, batchQueueExpanded, setBatchQueueExpanded, addToBatchQueue, removeFromBatchQueue, clearCompletedFromQueue, processNextInQueue };
}
