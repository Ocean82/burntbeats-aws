import { mergeConfig } from "vite";
import { defineConfig, defaultExclude } from "vitest/config";
import type { ConfigEnv, UserConfig } from "vite";
import viteConfig from "./vite.config";

const resolved: UserConfig =
  typeof viteConfig === "function"
    ? (viteConfig as (env: ConfigEnv) => UserConfig)({ mode: "test", command: "serve" })
    : viteConfig;

export default mergeConfig(
  resolved,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      // Playwright specs live under e2e/; they must run via `npm run test:e2e`, not Vitest.
      exclude: [...defaultExclude, "**/e2e/**"],
    },
  })
);
