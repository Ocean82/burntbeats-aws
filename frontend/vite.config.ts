/// <reference types="vitest" />
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig as defineViteConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineViteConfig(({ mode }) => {
  const isSingleFileMode = mode === "singlefile";
  const isProduction = mode === "production";
  return {
    plugins: [react(), tailwindcss(), ...(isSingleFileMode ? [viteSingleFile()] : [])],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@shared": path.resolve(__dirname, "..", "shared"),
      },
    },
    build: {
      sourcemap: isProduction ? false : true,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (!id.includes("node_modules")) return undefined;

            // Animation and icon packs are sizeable and change less often.
            if (id.includes("/framer-motion/")) return "vendor-motion";
            if (id.includes("/lucide-react/")) return "vendor-icons";

            // Auth/billing integrations are only needed in specific flows.
            if (id.includes("/@clerk/")) return "vendor-clerk";
            if (id.includes("/@stripe/")) return "vendor-stripe";

            // Everything else from third-party dependencies.
            return "vendor";
          },
        },
      },
    },
  };
});
