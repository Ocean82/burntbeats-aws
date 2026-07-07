import { apiGet, apiPost } from "./client";

export interface ReferralProfile {
  code: string;
  inviteCount: number;
  tokensEarned: number;
  bonusTokens: number;
  shareUrl: string;
}

export async function fetchReferralProfile(): Promise<ReferralProfile | null> {
  const result = await apiGet<ReferralProfile>("/api/referral/me");
  if (result.error || !result.data) return null;
  return result.data;
}

export async function attachReferralCode(code: string): Promise<boolean> {
  const result = await apiPost<{ ok: boolean }>("/api/referral/attach", { code });
  return !result.error && result.data?.ok === true;
}

export async function markFirstSplitComplete(): Promise<void> {
  await apiPost("/api/onboarding/first-split-complete", {});
}
