import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

if (typeof import.meta.env?.DEV !== "undefined" && import.meta.env.DEV) {
  console.log("[Burnt Beats] Frontend boot");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
