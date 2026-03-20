import type { ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Root shell: catches unhandled render errors so the document is not left blank.
 * Add cross-cutting providers here (router, query client, theme) when needed.
 * Domain-specific boundaries (split vs mixer) are composed inside `App`.
 */
export function AppShell({ children }: AppShellProps): ReactNode {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
