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
      },
    },
    build: {
      sourcemap: isProduction ? false : true,
    },
  };
});
