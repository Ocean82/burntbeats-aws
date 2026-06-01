import { resolveEntitlementStateForUser } from "./billing/entitlements.js";

const userId = process.argv[2];
const state = await resolveEntitlementStateForUser(userId);
const payload = {
  active: state.plan !== null,
  plan: state.plan,
  entitlementSource: state.entitlementSource,
  capabilities: state.capabilities,
};
console.log(JSON.stringify(payload, null, 2));
