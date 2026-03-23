/**
 * Auth UI components for use inside the authenticated app shell.
 * Auth gating and routing are handled in Root.tsx.
 */
import { UserButton } from "@clerk/react";

/** Drop-in user avatar/menu button for the app header. */
export function HeaderUserButton() {
  return <UserButton />;
}

// Keep AuthGate exported so existing imports don't break,
// but it's a transparent passthrough — Root handles the real gate.
export function AuthGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
