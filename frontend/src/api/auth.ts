/**
 * API authentication: Clerk JWT token provider and per-job token management.
 *
 * The token provider is injected at app startup by ClerkProvider to avoid
 * importing Clerk hooks directly into the API layer.
 */

// Token provider injected at app startup by ClerkProvider — avoids importing Clerk hooks here.
let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (!_getToken) return {};
  const token = await _getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// Per-job token store: job_id → job_token (short-lived, issued by backend on split/expand)
const jobTokenStore = new Map<string, string>();

export function getJobToken(jobId: string): string | undefined {
  return jobTokenStore.get(jobId);
}

export function setJobToken(jobId: string, token: string) {
  jobTokenStore.set(jobId, token);
}

export function clearJobToken(jobId: string) {
  jobTokenStore.delete(jobId);
}

export function jobTokenHeader(jobId: string): Record<string, string> {
  const t = getJobToken(jobId);
  return t ? { "x-job-token": t } : {};
}
