import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import { LEGAL_VERSIONS } from "../legal/versions";
import { acceptLegal } from "../api";
import { isLocalDevFullApp } from "../config";
import { trackEvent } from "../analytics/events";

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

/**
 * In local dev full-app mode, bypass the legal gate entirely.
 * This wrapper avoids calling Clerk hooks when they aren't needed.
 */
export function LegalAcceptanceGate({ children }: { children: React.ReactNode }) {
  if (isLocalDevFullApp()) return <>{children}</>;
  return <LegalAcceptanceGateInner>{children}</LegalAcceptanceGateInner>;
}

function LegalAcceptanceGateInner({ children }: { children: React.ReactNode }) {
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

  useEffect(() => {
    if (!needsAcceptance) return;
    trackEvent("legal_gate_shown", {
      tos_version: LEGAL_VERSIONS.tos,
      privacy_version: LEGAL_VERSIONS.privacy,
    });
  }, [needsAcceptance]);

  const onAccept = useCallback(async () => {
    setError(null);
    if (!checked) return;
    setSubmitting(true);
    trackEvent("legal_accept_submit", {
      tos_version: LEGAL_VERSIONS.tos,
      privacy_version: LEGAL_VERSIONS.privacy,
    });
    try {
      await acceptLegal({ tosVersion: LEGAL_VERSIONS.tos, privacyVersion: LEGAL_VERSIONS.privacy });
      // Clerk user object should update shortly; gate will re-render and allow entry.
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to record acceptance. Please try again.";
      setError(
        `${msg} If this persists, sign out and sign back in, then try again.`
      );
      trackEvent("legal_accept_failed", {
        error: msg.slice(0, 120),
      });
    } finally {
      setSubmitting(false);
    }
  }, [checked]);

  if (!needsAcceptance) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto flex w-full max-w-xl flex-col gap-lg px-md py-10 sm:px-lg sm:py-14">
        <div className="rounded-3xl border border-border bg-muted p-lg shadow-elevation-xl backdrop-blur sm:p-lg">
          <h1 className="text-2xl font-semibold leading-tight sm:text-4xl">Before you continue</h1>
          <p className="text-readable mt-xs text-sm leading-6 text-secondary-foreground">
            Please review and accept the{" "}
            <a className="text-primary-300 hover:text-primary-200 underline underline-offset-4" href="/terms-of-service" target="_blank" rel="noreferrer">
              Terms of Service
            </a>{" "}
            and{" "}
            <a className="text-primary-300 hover:text-primary-200 underline underline-offset-4" href="/privacy-policy" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </p>

          <label className="mt-lg flex cursor-pointer items-start gap-sm rounded-2xl border border-border bg-muted p-md sm:p-lg">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary-400"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={submitting}
            />
            <span className="text-readable text-sm text-secondary-foreground">
              I agree to the Terms of Service and Privacy Policy.
            </span>
          </label>

          {error && (
            <p className="mt-sm rounded-xl border border-destructive-400/25 bg-destructive-500/10 px-md py-xs text-sm text-destructive-100">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onAccept}
            disabled={!checked || submitting}
            className="fire-button mt-lg w-full rounded-xl px-md py-sm text-sm font-semibold transition disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Agree and continue"}
          </button>

          <p className="mt-sm text-xs text-muted-foreground">
            Version: Terms {LEGAL_VERSIONS.tos} · Privacy {LEGAL_VERSIONS.privacy}
          </p>
        </div>
      </div>
    </div>
  );
}
