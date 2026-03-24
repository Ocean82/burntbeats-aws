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

export function Root() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const localFullApp = isLocalDevFullApp();

  // Inject Clerk token provider into the API client as soon as auth is ready
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

  // Local QA: full stem app without sign-in or Stripe (dev + VITE_LOCAL_DEV_FULL_APP only)
  if (localFullApp) {
    return (
      <ErrorBoundary>
        <AppShell>
          <App />
        </AppShell>
      </ErrorBoundary>
    );
  }

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
