import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { initGoogleTag } from "./analytics/initGoogleTag";
import "./index.css";
import { Root } from "./Root";

const gaMeasurementId = String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();
if (gaMeasurementId) {
  initGoogleTag(gaMeasurementId);
}

if (import.meta.env.PROD && String(import.meta.env.VITE_LOCAL_DEV_FULL_APP ?? "").trim()) {
  console.warn(
    "[Burnt Beats] VITE_LOCAL_DEV_FULL_APP is set in a production build; it is ignored (see isLocalDevFullApp in config.ts).",
  );
}

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
if (!clerkPubKey && import.meta.env.PROD) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY — required for production builds");
}
if (!clerkPubKey) {
  console.warn("[Burnt Beats] Missing VITE_CLERK_PUBLISHABLE_KEY — auth features disabled (local dev mode)");
}

const stripePubKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
if (!stripePubKey && import.meta.env.PROD) {
  console.warn("[Burnt Beats] Missing VITE_STRIPE_PUBLISHABLE_KEY — billing features will not work");
}
if (import.meta.env.PROD && stripePubKey?.startsWith("pk_test_")) {
  console.warn(
    "[Burnt Beats] Stripe publishable key is pk_test_ in production. Use pk_live_ from the Stripe Dashboard for real charges.",
  );
}

const appTree = clerkPubKey ? (
  <ClerkProvider publishableKey={clerkPubKey} afterSignOutUrl="/">
    <Root />
  </ClerkProvider>
) : (
  <Root />
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {appTree}
  </StrictMode>
);
