/**
 * Root: decides whether to show the landing page or the app.
 * - Signed out → LandingPage (sign-in/sign-up via Clerk modal)
 * - Signed in  → AppShell + App (full stem editor)
 *
 * Uses wouter for lightweight client-side routing (back/forward, deep links).
 * Also handles ?checkout=success redirect from Stripe — cleans the URL
 * so the app doesn't re-trigger on refresh.
 */
import { useAuth } from "@clerk/react";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { setTokenProvider } from "./api";
import { isLocalDevFullApp } from "./config";
import { NotFoundPage } from "./pages/NotFoundPage";
import { trackEvent } from "./analytics/events";

const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const LegalPage = lazy(() =>
  import("./pages/LegalPage").then((m) => ({ default: m.LegalPage })),
);
const AppShell = lazy(() =>
  import("./app/app-shell.component").then((m) => ({ default: m.AppShell })),
);
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));
const LegalAcceptanceGate = lazy(() =>
  import("./components/LegalAcceptanceGate").then((m) => ({
    default: m.LegalAcceptanceGate,
  })),
);
const AudioProvider = lazy(() =>
  import("./contexts/AudioContext").then((m) => ({ default: m.AudioProvider })),
);
const WorkflowProvider = lazy(() =>
  import("./contexts/WorkflowContext").then((m) => ({
    default: m.WorkflowProvider,
  })),
);

/** Shown while Clerk loads session — avoids a blank screen (perceived hang). */
function ClerkLoadingShell() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-md bg-[var(--bg)] text-foreground"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <img
        src="/logo-emblem.png"
        alt=""
        className="logo-emblem h-14 w-14"
        aria-hidden="true"
      />
      <p className="logo-burnt">
        <span className="logo-burnt-fire text-2xl">Burnt Beats</span>
      </p>
      <Loader2 className="h-8 w-8 animate-spin text-primary-400/90" aria-hidden />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function RouteLoadingShell() {
  return <ClerkLoadingShell />;
}

function SignedInAppTree() {
  return (
    <Suspense fallback={<RouteLoadingShell />}>
      <LegalAcceptanceGate>
        <WorkflowProvider>
          <AudioProvider>
            <AppShell>
              <App />
            </AppShell>
          </AudioProvider>
        </WorkflowProvider>
      </LegalAcceptanceGate>
    </Suspense>
  );
}

/** Local dev mode: full stem app without Clerk auth or Stripe billing. */
function LocalDevRoot() {
  useEffect(() => {
    setTokenProvider(() => Promise.resolve(null));
  }, []);

  return (
    <ErrorBoundary>
      <SignedInAppTree />
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
      if (window.location.search.includes("checkout=cancelled")) {
        trackEvent("checkout_returned_cancelled", { source: "root_handler" });
        window.sessionStorage.setItem(
          "burntbeats_checkout_notice",
          "Checkout was canceled. You can try again or use a one-time pack.",
        );
      }
      if (window.location.search.includes("checkout=success")) {
        trackEvent("checkout_returned_success", { source: "root_handler" });
      }
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
        <Suspense fallback={<RouteLoadingShell />}>
          <LandingPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SignedInAppTree />
    </ErrorBoundary>
  );
}

export function Root() {
  return (
    <Switch>
      <Route path="/privacy-policy">
        <Suspense fallback={<RouteLoadingShell />}>
          <LegalPage doc="privacy-policy" />
        </Suspense>
      </Route>
      <Route path="/terms-of-service">
        <Suspense fallback={<RouteLoadingShell />}>
          <LegalPage doc="terms-of-service" />
        </Suspense>
      </Route>
      <Route path="/">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/speech">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/midi">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/pricing">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/my-stems">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/library">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/tuner">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route>
        <NotFoundPage />
      </Route>
    </Switch>
  );
}
