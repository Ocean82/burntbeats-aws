/// <reference types="vitest" />
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig as defineViteConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { burntBeatsSeoPlugin } from "./vite-seo-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineViteConfig(({ mode }) => {
  const isSingleFileMode = mode === "singlefile";
  const isProduction = mode === "production";

  // Only enable Sentry source map upload for production builds when auth token is available
  const enableSentryPlugin =
    isProduction && !!process.env.SENTRY_AUTH_TOKEN;

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isSingleFileMode ? [] : [burntBeatsSeoPlugin()]),
      ...(isSingleFileMode ? [viteSingleFile()] : []),
      ...(enableSentryPlugin
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              sourcemaps: {
                filesToDeleteAfterUpload: ["./dist/**/*.map"],
              },
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@shared": path.resolve(__dirname, "..", "shared"),
        "pitch-plugin": path.resolve(__dirname, "src/components/multi-stem-editor/pitch-tempo-plugin/src/index.ts"),
      },
    },
    build: {
      // Enable source maps for production when Sentry plugin is active (maps are deleted after upload).
      // Otherwise, no source maps in production to avoid exposing original source.
      sourcemap: enableSentryPlugin ? "hidden" : !isProduction,
      chunkSizeWarningLimit: 550,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (!id.includes("node_modules")) return undefined;

            // Animation and icon packs are sizeable and change less often.
            if (id.includes("/framer-motion/")) return "vendor-motion";
            if (id.includes("/lucide-react/"))  return "vendor-icons";

            // Auth/billing integrations are only needed in specific flows.
            if (id.includes("/@clerk/")) return "vendor-clerk";
            if (id.includes("/@stripe/")) return "vendor-stripe";

            // Heavy audio/media libraries — only loaded when features are hit.
            if (id.includes("/tone/")) return "vendor-tone";
            if (id.includes("/jszip/")) return "vendor-jszip";
            if (id.includes("/lamejs/")) return "vendor-lamejs";
            if (id.includes("/midi-writer-js/")) return "vendor-midi";

            // Everything else (react, sentry, zustand, wouter, clsx, etc.).
            return "vendor";
          },
        },
      },
    },
  };
});
