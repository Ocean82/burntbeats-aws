import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AppShell } from "./app/app-shell.component";
import { App } from "./App";
import { ErrorBoundary } from "./components";

if (typeof import.meta.env?.DEV !== "undefined" && import.meta.env.DEV) {
  console.log("[Burnt Beats] Frontend boot");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppShell>
        <App />
      </AppShell>
    </ErrorBoundary>
  </StrictMode>
);
