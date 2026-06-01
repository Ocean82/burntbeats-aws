#!/usr/bin/env node
import { resolveEntitlementStateForUser } from "../backend/billing/entitlements.js";

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: node scripts/resolve-entitlement-one.mjs <clerk_user_id>");
  process.exit(1);
}

const state = await resolveEntitlementStateForUser(userId);
console.log(JSON.stringify(state, null, 2));
