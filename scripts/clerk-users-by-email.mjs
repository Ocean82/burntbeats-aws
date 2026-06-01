#!/usr/bin/env node
import fs from "fs";
import path from "path";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/clerk-users-by-email.mjs <email>");
  process.exit(1);
}

const envPath = path.join(process.cwd(), "backend", ".env");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const res = await fetch(
  `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=10`,
  { headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` } },
);
const data = await res.json();
for (const u of data || []) {
  const em = u.email_addresses?.[0]?.email_address;
  console.log({
    id: u.id,
    email: em,
    stripeCustomerId: u.public_metadata?.stripeCustomerId,
    tokenBalance: u.private_metadata?.usageTokens?.balance,
  });
}
