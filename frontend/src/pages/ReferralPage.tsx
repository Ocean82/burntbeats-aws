import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { Copy, Check, Gift, Users } from "lucide-react";
import { fetchReferralProfile, type ReferralProfile } from "../api/referral";

export function ReferralPage() {
  const { user } = useUser();
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const data = await fetchReferralProfile();
      if (cancelled) return;
      if (!data) {
        setError("Referral program is not available right now. Try again later.");
      } else {
        setProfile(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!profile?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(profile.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [profile]);

  const firstName = user?.firstName || "Producer";

  return (
    <div className="min-h-screen bg-[var(--bg)] px-md py-xl text-foreground">
      <div className="mx-auto max-w-lg">
        <div className="mb-lg text-center">
          <Gift className="mx-auto h-10 w-10 text-primary-400" aria-hidden />
          <h1 className="mt-md text-2xl font-bold">Invite producers, earn minutes</h1>
          <p className="mt-sm text-sm text-secondary-foreground">
            {firstName}, share Burnt Beats with a friend. When they complete their first split,
            you both get bonus tokens.
          </p>
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Loading your link…</p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-border bg-muted/50 p-md text-center text-sm text-muted-foreground">
            {error}
          </p>
        ) : null}

        {profile ? (
          <div className="glass-panel rounded-2xl border border-border p-lg">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your invite link
            </p>
            <p className="mt-2 break-all rounded-lg border border-border bg-background/60 px-md py-sm font-mono text-sm text-primary-100">
              {profile.shareUrl}
            </p>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="fire-button tap-feedback mt-md inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy invite link"}
            </button>

            <div className="mt-lg grid grid-cols-2 gap-md border-t border-border pt-lg">
              <div className="text-center">
                <Users className="mx-auto h-5 w-5 text-primary-400" aria-hidden />
                <p className="mt-1 text-xl font-bold">{profile.inviteCount}</p>
                <p className="text-xs text-muted-foreground">Friends invited</p>
              </div>
              <div className="text-center">
                <Gift className="mx-auto h-5 w-5 text-primary-400" aria-hidden />
                <p className="mt-1 text-xl font-bold">{profile.tokensEarned}</p>
                <p className="text-xs text-muted-foreground">Bonus tokens earned</p>
              </div>
            </div>

            <p className="mt-lg text-center text-xs text-muted-foreground">
              Each successful invite: +{profile.bonusTokens} tokens for you and your friend
              (after their first split).
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
