import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import "./index.css";
import { Root } from "./Root";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const stripePubKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
if (!stripePubKey && import.meta.env.PROD) {
  console.warn("[Burnt Beats] Missing VITE_STRIPE_PUBLISHABLE_KEY — billing features will not work");
}

if (import.meta.env.DEV) {
  console.log("[Burnt Beats] Frontend boot");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPubKey} afterSignOutUrl="/">
      <Root />
    </ClerkProvider>
  </StrictMode>
);
