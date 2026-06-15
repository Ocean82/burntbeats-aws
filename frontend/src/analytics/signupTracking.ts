import { trackEvent } from "./events";

const SIGNUP_TRACKED_PREFIX = "bb_signup_tracked_";

interface SignupTrackUser {
  id: string;
  createdAt: Date | null;
}

/**
 * Records signup_completed once per user when the account is newly created.
 * Sign-in for returning users does not emit this event.
 */
export function trackSignupCompletedOnce(user: SignupTrackUser | null | undefined): void {
  if (!user?.id || !user.createdAt) return;
  if (typeof window === "undefined") return;

  const storageKey = `${SIGNUP_TRACKED_PREFIX}${user.id}`;
  if (window.localStorage.getItem(storageKey)) return;

  const ageMs = Date.now() - user.createdAt.getTime();
  const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
  if (ageMs > NEW_ACCOUNT_WINDOW_MS) return;

  window.localStorage.setItem(storageKey, "1");
  trackEvent("signup_completed", { method: "clerk" });
}
