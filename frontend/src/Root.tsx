/**
 * Root: decides whether to show the landing page or the app.
 * - Signed out → LandingPage (sign-in/sign-up via Clerk modal)
 * - Signed in  → AppShell + App (full stem editor)
 *
 * Uses wouter for lightweight client-side routing (back/forward, deep links).
 * Also handles ?checkout=success redirect from Stripe — cleans the URL
 * so the app doesn't re-trigger on refresh.
 */
import { useAuth, useUser } from "@clerk/react";
import { lazy, Suspense, useEffect, useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Route, Switch, useLocation } from "wouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { setTokenProvider } from "./api";
import { isLocalDevFullApp } from "./config";
import { NotFoundPage } from "./pages/NotFoundPage";
import { trackCheckoutReturnedOnce } from "./analytics/checkoutTracking";
import { trackSignupCompletedOnce } from "./analytics/signupTracking";
import { usePageViews } from "./analytics/usePageViews";
import { useDocumentMeta } from "./seo/useDocumentMeta";

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
const StemMediaProvider = lazy(() =>
  import("./contexts/StemMediaContext").then((m) => ({
    default: m.StemMediaProvider,
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

import { PlanPickerPage } from "./pages/PlanPickerPage";
import { captureReferralFromUrl, useReferralAttach } from "./hooks/useReferralCapture";

const ReferralPage = lazy(() =>
  import("./pages/ReferralPage").then((m) => ({ default: m.ReferralPage })),
);

function PlanPickerGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const pickerSeen = useMemo(() => {
    if (!isLoaded || !user) return true;
    const meta = user.unsafeMetadata as Record<string, unknown> | undefined;
    return meta?.planPickerSeen === true;
  }, [isLoaded, user]);

  if (pickerSeen || dismissed) return <>{children}</>;

  return (
    <PlanPickerPage
      onComplete={() => {
        setDismissed(true);
        navigate("/editor");
      }}
    />
  );
}

function SignedInAppTree({
  shouldSkipPlanPicker = false,
}: {
  shouldSkipPlanPicker?: boolean;
}) {
  const workspaceTree = (
    <WorkflowProvider>
      <StemMediaProvider>
        <AudioProvider>
          <AppShell>
            <App />
          </AppShell>
        </AudioProvider>
      </StemMediaProvider>
    </WorkflowProvider>
  );

  return (
    <Suspense fallback={<RouteLoadingShell />}>
      <LegalAcceptanceGate>
        {shouldSkipPlanPicker ? workspaceTree : <PlanPickerGate>{workspaceTree}</PlanPickerGate>}
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
      <SignedInAppTree shouldSkipPlanPicker />
    </ErrorBoundary>
  );
}

function RouteSeoSync() {
  const [location] = useLocation();
  useDocumentMeta(location);
  usePageViews(location);
  return null;
}

/** Authenticated root: Clerk sign-in gate + token injection. */
function AuthenticatedRoot() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const [location] = useLocation();

  useEffect(() => {
    if (isLoaded) setTokenProvider(() => getToken());
  }, [isLoaded, getToken]);

  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  useReferralAttach();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    trackSignupCompletedOnce(
      user
        ? {
            id: user.id,
            createdAt: user.createdAt,
          }
        : null,
    );
  }, [isLoaded, isSignedIn, user]);

  // Clean up ?checkout= query params left by Stripe redirect
  useEffect(() => {
    if (window.location.search.includes("checkout=")) {
      if (window.location.search.includes("checkout=cancelled")) {
        trackCheckoutReturnedOnce("cancelled", "root_handler");
        window.sessionStorage.setItem(
          "burntbeats_checkout_notice",
          "Checkout was canceled. You can try again or use a one-time pack.",
        );
      }
      if (window.location.search.includes("checkout=success")) {
        trackCheckoutReturnedOnce("success", "root_handler");
        const meta = user?.unsafeMetadata as Record<string, unknown> | undefined;
        if (meta?.planPickerSeen !== true) {
          user?.update({ unsafeMetadata: { ...meta, planPickerSeen: true } }).catch(() => {});
        }
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.toString());
    }
  }, [user]);

  if (!isLoaded) return <ClerkLoadingShell />;

  if (!isSignedIn) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<RouteLoadingShell />}>
          <LandingPage
            focusSection={location === "/pricing" ? "pricing" : undefined}
          />
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

function ReferralRoute() {
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    captureReferralFromUrl();
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
      <Suspense fallback={<RouteLoadingShell />}>
        <ReferralPage />
      </Suspense>
    </ErrorBoundary>
  );
}

export function Root() {
  return (
    <>
      <RouteSeoSync />
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
      <Route path="/editor">
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
      <Route path="/beats">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/library">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/tuner">
        {isLocalDevFullApp() ? <LocalDevRoot /> : <AuthenticatedRoot />}
      </Route>
      <Route path="/referral">
        <ReferralRoute />
      </Route>
      <Route>
        <NotFoundPage />
      </Route>
    </Switch>
    </>
  );
}
