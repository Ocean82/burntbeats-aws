import type { ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { LayoutModeProvider } from "../contexts/LayoutModeContext";
import { ToastProvider } from "../components/ToastProvider";
import { OfflineBanner } from "../components/OfflineBanner";

export interface AppShellProps {
  children: ReactNode;
}

/**
 * App shell for the authenticated editor view.
 * Token injection and auth gating are handled in Root.tsx.
 * Add cross-cutting providers here (router, query client, theme) when needed.
 */
export function AppShell({ children }: AppShellProps): ReactNode {
  return (
    <ErrorBoundary>
      <LayoutModeProvider>
        <OfflineBanner />
        {children}
        <ToastProvider />
      </LayoutModeProvider>
    </ErrorBoundary>
  );
}
