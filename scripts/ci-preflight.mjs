import { spawnSync } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

function getRepoRoot() {
  const here = fileURLToPath(import.meta.url)
  return path.resolve(path.dirname(here), "..")
}

function runCommand(command, args, options) {
  const label = options?.label ?? `${command} ${args.join(" ")}`
  console.log(`\n[ci-preflight] ▶ ${label}`)

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`)
  }
}

function getGitRef() {
  const ref = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
    cwd: getRepoRoot(),
    shell: false,
  })
  const sha = ref.stdout?.trim() ?? "unknown"
  return sha
}

async function main() {
  const repoRoot = getRepoRoot()
  const sha = getGitRef()

  console.log("[ci-preflight] Starting")
  console.log(`[ci-preflight] Repo: ${repoRoot}`)
  console.log(`[ci-preflight] Git SHA: ${sha}`)

  const env = { ...process.env, CI: process.env.CI ?? "true" }

  // Run the same high-signal frontend checks CI runs (excluding Playwright smoke).
  const frontendDir = path.join(repoRoot, "frontend")
  runCommand("npm", ["run", "lint"], { cwd: frontendDir, env, label: "frontend lint" })
  runCommand("npx", ["tsc", "--noEmit"], { cwd: frontendDir, env, label: "frontend typecheck" })
  runCommand("npm", ["run", "test:run"], {
    cwd: frontendDir,
    env,
    label: "frontend unit tests",
  })
  runCommand("npm", ["run", "build"], { cwd: frontendDir, env, label: "frontend build" })

  // Run the same backend test subset CI uses.
  const backendDir = path.join(repoRoot, "backend")
  runCommand("npm", ["run", "lint"], { cwd: backendDir, env, label: "backend lint" })
  runCommand("node", [
    "--test",
    "server.test.js",
    "tests/auth-gates.test.mjs",
    "tests/midi-auth.test.mjs",
    "tests/midi-storage-health.test.mjs",
    "tests/midi-convert-validation.test.mjs",
    "tests/midi-status-auth.test.mjs",
    "tests/midi-rhythm.test.mjs",
    "routes/midi/__tests__/rhythm.proxy.test.mjs",
    "routes/midi/__tests__/soundfonts.proxy.test.mjs",
  ], { cwd: backendDir, env, label: "backend MIDI hardening tests (node:test)" })

  console.log("\n[ci-preflight] ✅ All preflight checks passed")
}

main().catch((err) => {
  console.error("\n[ci-preflight] ❌ Preflight failed:", err?.message ?? err)
  process.exit(1)
})

