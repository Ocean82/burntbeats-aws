// @ts-check
/**
 * Billing module barrel — composes sub-routers into a single billingRouter.
 *
 * Preserves the `billingRouter` export name used by server.js.
 */
import express from "express";
import { subscriptionRouter } from "./subscription.js";
import { checkoutRouter } from "./checkout.js";
import { webhookRouter } from "./webhook.js";

const billingRouter = express.Router();

// Mount sub-routers (all routes are relative to /api/billing)
billingRouter.use(subscriptionRouter);
billingRouter.use(checkoutRouter);
billingRouter.use(webhookRouter);

export { billingRouter };
