/**
 * Legal acceptance API call.
 */
import { apiPost } from "./client";

export async function acceptLegal(params: { tosVersion: string; privacyVersion: string }): Promise<{ ok: true }> {
  const result = await apiPost<{ ok?: unknown }>("/api/legal/accept", params);
  if (result.error || !result.data) {
    throw new Error(result.error || `Accept legal failed: ${result.status}`);
  }
  if (result.data.ok === true) return { ok: true };
  throw new Error("Something went wrong. Please try again.");
}
