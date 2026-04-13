import { useCallback, useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import { LEGAL_VERSIONS } from "../legal/versions";
import { acceptLegal } from "../api";

type LegalAcceptance = {
  tosVersion?: string;
  privacyVersion?: string;
  acceptedAt?: string;
};

function readAcceptance(u: unknown): LegalAcceptance | null {
  if (!u || typeof u !== "object") return null;
  const pub = (u as { publicMetadata?: unknown }).publicMetadata;
  if (!pub || typeof pub !== "object") return null;
  const acc = (pub as { legalAccepted?: unknown }).legalAccepted;
  if (!acc || typeof acc !== "object") return null;
  const a = acc as Record<string, unknown>;
  return {
    tosVersion: typeof a.tosVersion === "string" ? a.tosVersion : undefined,
    privacyVersion: typeof a.privacyVersion === "string" ? a.privacyVersion : undefined,
    acceptedAt: typeof a.acceptedAt === "string" ? a.acceptedAt : undefined,
  };
}

export function LegalAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAcceptance = useMemo(() => {
    if (!isLoaded) return true;
    const acc = readAcceptance(user);
    if (!acc) return true;
    return acc.tosVersion !== LEGAL_VERSIONS.tos || acc.privacyVersion !== LEGAL_VERSIONS.privacy;
  }, [isLoaded, user]);

  const onAccept = useCallback(async () => {
    setError(null);
    if (!checked) return;
    setSubmitting(true);
    try {
      await acceptLegal({ tosVersion: LEGAL_VERSIONS.tos, privacyVersion: LEGAL_VERSIONS.privacy });
      // Clerk user object should update shortly; gate will re-render and allow entry.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [checked]);

  if (!needsAcceptance) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto flex max-w-xl flex-col gap-6 px-4 py-14 sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-6 shadow-2xl backdrop-blur">
          <h1 className="text-xl font-semibold">Before you continue</h1>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Please review and accept the{" "}
            <a className="text-amber-300 hover:text-amber-200 underline underline-offset-4" href="/terms-of-service" target="_blank" rel="noreferrer">
              Terms of Service
            </a>{" "}
            and{" "}
            <a className="text-amber-300 hover:text-amber-200 underline underline-offset-4" href="/privacy-policy" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </p>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-amber-400"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={submitting}
            />
            <span className="text-sm text-white/85">
              I agree to the Terms of Service and Privacy Policy.
            </span>
          </label>

          {error && (
            <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2 text-sm text-red-100">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onAccept}
            disabled={!checked || submitting}
            className="fire-button mt-5 w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Agree and continue"}
          </button>

          <p className="mt-3 text-xs text-white/50">
            Version: Terms {LEGAL_VERSIONS.tos} · Privacy {LEGAL_VERSIONS.privacy}
          </p>
        </div>
      </div>
    </div>
  );
}

