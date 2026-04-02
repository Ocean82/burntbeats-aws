import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
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
    },
  })
);
