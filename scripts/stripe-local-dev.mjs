#!/usr/bin/env node
/**
 * Local Stripe test-mode workflow (no real charges):
 * 1. Refuses sk_live_ / pk_live_ in backend/.env and frontend/.env
 * 2. Sets STRIPE_WEBHOOK_SECRET in backend/.env from `stripe listen --print-secret`
 * 3. Runs `stripe listen --forward-to localhost:<port>/api/billing/webhook`
 *
 * Usage (repo root): node scripts/stripe-local-dev.mjs
 * From backend:      npm run stripe:listen
 * Env: BACKEND_PORT=3001  STRIPE_LOCAL_SKIP_SYNC=1 (skip .env webhook update)
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const backendEnv = join(root, "backend", ".env");
const frontendEnv = join(root, "frontend", ".env");

function checkStripeCli() {
  try {
    execSync("stripe --version", { stdio: "pipe", shell: process.platform === "win32" });
  } catch {
    console.error("Install Stripe CLI and log in: https://stripe.com/docs/stripe-cli\n  stripe login");
    process.exit(1);
  }
}

function assertTestModeKeys() {
  if (!existsSync(backendEnv)) {
    console.error("Missing backend/.env — copy backend/.env.example");
    process.exit(1);
  }
  const be = readFileSync(backendEnv, "utf8");
  if (/^STRIPE_SECRET_KEY=sk_live_/m.test(be)) {
    console.error(
      "Refusing to continue: backend/.env has STRIPE_SECRET_KEY=sk_live_...\n" +
        "Use Test mode in the Stripe Dashboard and sk_test_... for local testing (no real charges).",
    );
    process.exit(1);
  }
  if (!/^STRIPE_SECRET_KEY=sk_test_/m.test(be)) {
    console.warn(
      "[warn] backend/.env STRIPE_SECRET_KEY should be sk_test_... for local testing without real charges.",
    );
  }
  if (existsSync(frontendEnv)) {
    const fe = readFileSync(frontendEnv, "utf8");
    if (/^VITE_STRIPE_PUBLISHABLE_KEY=pk_live_/m.test(fe)) {
      console.error(
        "Refusing to continue: frontend/.env has VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...\n" +
          "Use pk_test_... (Dashboard → Test mode) to match sk_test_.",
      );
      process.exit(1);
    }
  }
}

function syncWebhookSecretFromCli() {
  if (process.env.STRIPE_LOCAL_SKIP_SYNC === "1") {
    console.log("STRIPE_LOCAL_SKIP_SYNC=1 — not updating backend/.env STRIPE_WEBHOOK_SECRET\n");
    return;
  }
  let whsec;
  try {
    whsec = execSync("stripe listen --print-secret", {
      encoding: "utf8",
      shell: process.platform === "win32",
    }).trim();
  } catch (err) {
    const detail = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : String(err?.message ?? err);
    console.error("stripe listen --print-secret failed:", detail.trim() || "(no details)");
    console.error("Install/upgrade CLI: https://stripe.com/docs/stripe-cli  then:  stripe login");
    process.exit(1);
  }
  if (!whsec.startsWith("whsec_")) {
    console.error("Unexpected output from stripe listen --print-secret (expected whsec_...). Got:", whsec.slice(0, 40));
    process.exit(1);
  }
  let txt = readFileSync(backendEnv, "utf8");
  const lineRe = /^STRIPE_WEBHOOK_SECRET=.*$/m;
  if (lineRe.test(txt)) {
    txt = txt.replace(lineRe, `STRIPE_WEBHOOK_SECRET=${whsec}`);
  } else {
    txt = `${txt.trimEnd()}\nSTRIPE_WEBHOOK_SECRET=${whsec}\n`;
  }
  writeFileSync(backendEnv, txt);
  console.log("Updated backend/.env STRIPE_WEBHOOK_SECRET from Stripe CLI (test mode).");
  console.log("If the backend is already running, restart it so webhook verification uses this secret.\n");
}

function listen() {
  const port = process.env.BACKEND_PORT || "3001";
  const target = `localhost:${port}/api/billing/webhook`;
  console.log(`Forwarding Stripe test webhooks to http://${target}`);
  console.log("Press Ctrl+C to stop.\n");
  const child = spawn("stripe", ["listen", "--forward-to", target], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

function main() {
  checkStripeCli();
  assertTestModeKeys();
  syncWebhookSecretFromCli();
  listen();
}

main();
