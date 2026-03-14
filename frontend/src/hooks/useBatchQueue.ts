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
    onError: (msg: string) => void
  ) => Promise<void>;
}

export function useBatchQueue(): UseBatchQueueReturn {
  const [batchQueue, setBatchQueue] = useState<QueueItem[]>([]);
  const [batchQueueExpanded, setBatchQueueExpanded] = useState(false);
  const queueFileRef = useRef<Map<string, File>>(new Map());

  const addToBatchQueue = useCallback((file: File | null) => {
    if (!file) return;
    const id = crypto.randomUUID();
    setBatchQueue((q) => [...q, { id, fileName: file.name, fileSize: file.size, status: "queued" as const, progress: 0 }]);
    queueFileRef.current.set(id, file);
  }, []);

  const removeFromBatchQueue = useCallback((id: string) => {
    queueFileRef.current.delete(id);
    setBatchQueue((q) => q.filter((item) => item.id !== id));
  }, []);

  const clearCompletedFromQueue = useCallback(() => {
    setBatchQueue((q) => q.filter((item) => item.status !== "complete"));
  }, []);

  const processNextInQueue = useCallback(async (
    stemCount: 2 | 4,
    splitQuality: SplitQuality,
    onStemsReady: (stems: StemResult[]) => void,
    onError: (msg: string) => void
  ) => {
    const queued = batchQueue.find((i) => i.status === "queued");
    if (!queued) return;
    const file = queueFileRef.current.get(queued.id);
    if (!file) { setBatchQueue((q) => q.filter((i) => i.id !== queued.id)); return; }

    setBatchQueue((q) => q.map((i) => i.id === queued.id ? { ...i, status: "processing" as const, progress: 0 } : i));
    try {
      const res = await splitStems(file, String(stemCount) as "2" | "4", splitQuality, (status) => {
        setBatchQueue((q) => q.map((i) => i.id === queued.id ? { ...i, progress: status.progress } : i));
      });
      setBatchQueue((q) => q.map((i) => i.id === queued.id ? { ...i, status: "complete" as const, progress: 100 } : i));
      onStemsReady(res.stems);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Split failed";
      setBatchQueue((q) => q.map((i) => i.id === queued.id ? { ...i, status: "error" as const, error: msg } : i));
      onError(msg);
    } finally {
      queueFileRef.current.delete(queued.id);
    }
  }, [batchQueue]);

  return { batchQueue, batchQueueExpanded, setBatchQueueExpanded, addToBatchQueue, removeFromBatchQueue, clearCompletedFromQueue, processNextInQueue };
}
