/**
 * Legal acceptance API call.
 */
import { API_BASE } from "../config";
import { authHeaders } from "./auth";
import { tryParseJson, getApiErrorMessage } from "./validation";
import { userFacingApiError, userFacingHttpError } from "../userFacingError";

export async function acceptLegal(params: { tosVersion: string; privacyVersion: string }): Promise<{ ok: true }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/legal/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const contentType = res.headers.get("content-type") || "";
    let bodyError: string | null = null;
    if (contentType.includes("application/json") && text) {
      bodyError = getApiErrorMessage(tryParseJson(text));
    }
    throw new Error(
      userFacingHttpError(res.status, bodyError, text.slice(0, 800) || `Accept legal failed: ${res.status}`)
    );
  }
  const j = (await res.json()) as { ok?: unknown };
  if (j && j.ok === true) return { ok: true };
  throw new Error(userFacingApiError(null, "Something went wrong. Please try again."));
}
