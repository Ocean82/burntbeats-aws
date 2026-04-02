/**
 * Root: decides whether to show the landing page or the app.
 * - Signed out → LandingPage (sign-in/sign-up via Clerk modal)
 * - Signed in  → AppShell + App (full stem editor)
 *
 * Also handles ?checkout=success redirect from Stripe — cleans the URL
 * so the app doesn't re-trigger on refresh.
 */
import { useAuth } from "@clerk/react";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./app/app-shell.component";
import { App } from "./App";
import { LandingPage } from "./pages/LandingPage";
import { setTokenProvider } from "./api";
import { isLocalDevFullApp } from "./config";

/** Shown while Clerk loads session — avoids a blank screen (perceived hang). */
function ClerkLoadingShell() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] text-white"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="logo-burnt">
        <span className="logo-burnt-fire text-2xl">Burnt Beats</span>
      </p>
      <Loader2 className="h-8 w-8 animate-spin text-amber-400/90" aria-hidden />
      <p className="text-sm text-white/55">Loading…</p>
    </div>
  );
}

/** Local dev mode: full stem app without Clerk auth or Stripe billing. */
function LocalDevRoot() {
  useEffect(() => {
    setTokenProvider(() => Promise.resolve(null));
  }, []);

  return (
    <ErrorBoundary>
      <AppShell>
        <App />
      </AppShell>
    </ErrorBoundary>
  );
}

/** Authenticated root: Clerk sign-in gate + token injection. */
function AuthenticatedRoot() {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  useEffect(() => {
    if (isLoaded) setTokenProvider(() => getToken());
  }, [isLoaded, getToken]);

  // Clean up ?checkout= query params left by Stripe redirect
  useEffect(() => {
    if (window.location.search.includes("checkout=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (!isLoaded) return <ClerkLoadingShell />;

  if (!isSignedIn) {
    return (
      <ErrorBoundary>
        <LandingPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell>
        <App />
      </AppShell>
    </ErrorBoundary>
  );
}

export function Root() {
  if (isLocalDevFullApp()) {
    return <LocalDevRoot />;
  }
  return <AuthenticatedRoot />;
}
