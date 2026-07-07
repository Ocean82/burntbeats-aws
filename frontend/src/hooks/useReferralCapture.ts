import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { attachReferralCode } from "../api/referral";

const STORAGE_KEY = "burntbeats_referral_code";

/** Persist ?ref= from the URL for post-signup attribution. */
export function captureReferralFromUrl(): void {
  if (typeof window === "undefined") return;
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (!ref?.trim()) return;
  sessionStorage.setItem(STORAGE_KEY, ref.trim().toUpperCase());
  const url = new URL(window.location.href);
  url.searchParams.delete("ref");
  window.history.replaceState({}, "", url.toString());
}

/** Attach stored referral code after the user signs in. */
export function useReferralAttach() {
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const code = sessionStorage.getItem(STORAGE_KEY);
    if (!code) return;

    void attachReferralCode(code).finally(() => {
      sessionStorage.removeItem(STORAGE_KEY);
    });
  }, [isLoaded, isSignedIn]);
}

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}
