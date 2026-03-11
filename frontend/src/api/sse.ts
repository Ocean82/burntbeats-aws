import type { StemJobStatus } from '../api';

const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')
    : typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost:3001';

export interface SSECallbacks {
  onProgress: (status: StemJobStatus) => void;
  onComplete: (status: StemJobStatus) => void;
  onError: (error: Error) => void;
}

export function createSSEConnection(jobId: string, callbacks: SSECallbacks): EventSource {
  const eventSource = new EventSource(`${API_BASE}/api/stems/stream/${jobId}`);

  eventSource.onmessage = (event) => {
    try {
      const status = JSON.parse(event.data) as StemJobStatus;
      callbacks.onProgress(status);

      if (status.status === 'completed') {
        callbacks.onComplete(status);
        eventSource.close();
      } else if (status.status === 'failed') {
        callbacks.onError(new Error(status.error ?? 'Stem separation failed'));
        eventSource.close();
      }
    } catch (error) {
      console.error('Failed to parse SSE message:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    callbacks.onError(new Error('Connection to stem service failed'));
    eventSource.close();
  };

  return eventSource;
}

export async function splitStemsWithSSE(
  file: File,
  stems: '2' | '4',
  quality?: 'quality' | 'speed',
  onProgress?: (status: StemJobStatus) => void
): Promise<{ job_id: string; status: string; stems: StemJobStatus['stems'] }> {
  const form = new FormData();
  form.append('file', file);
  form.append('stems', stems);
  if (quality) form.append('quality', quality);

  const res = await fetch(`${API_BASE}/api/stems/split`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Split failed: ${res.status}`);
  }

  const data = await res.json() as { job_id: string };
  const jobId = data.job_id;

  return new Promise((resolve, reject) => {
    const eventSource = createSSEConnection(jobId, {
      onProgress: (status) => {
        onProgress?.(status);
      },
      onComplete: (status) => {
        resolve({
          job_id: jobId,
          status: 'completed',
          stems: status.stems,
        });
      },
      onError: (error) => {
        reject(error);
      },
    });

    setTimeout(() => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        eventSource.close();
        reject(new Error('Stem separation timed out'));
      }
    }, 16 * 60 * 1000);
  });
}
