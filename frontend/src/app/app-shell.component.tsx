import type { ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";

export interface AppShellProps {
  children: ReactNode;
}

/**
 * App shell for the authenticated editor view.
 * Token injection and auth gating are handled in Root.tsx.
 * Add cross-cutting providers here (router, query client, theme) when needed.
 */
export function AppShell({ children }: AppShellProps): ReactNode {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
