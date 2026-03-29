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
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./app/app-shell.component";
import { App } from "./App";
import { LandingPage } from "./pages/LandingPage";
import { setTokenProvider } from "./api";
import { isLocalDevFullApp } from "./config";

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

  // Show nothing while Clerk is initialising (avoids flash of wrong page)
  if (!isLoaded) return null;

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
