import test from "node:test";
import assert from "node:assert/strict";

import { subscriptionTokenGrantFromPrice } from "./stripeMetadata.js";

test("subscriptionTokenGrantFromPrice returns one monthly grant for monthly prices", () => {
  const price = priceWithMonthlyTokens({
    tokensPerMonth: 300,
    interval: "month",
  });
  const sub = subscriptionWithPrice(price);

  assert.equal(subscriptionTokenGrantFromPrice(price, sub), 300);
});

test("subscriptionTokenGrantFromPrice returns twelve monthly grants for annual prices", () => {
  const price = priceWithMonthlyTokens({
    tokensPerMonth: 300,
    interval: "year",
  });
  const sub = subscriptionWithPrice(price);

  assert.equal(subscriptionTokenGrantFromPrice(price, sub), 3600);
});

function priceWithMonthlyTokens({ tokensPerMonth, interval }) {
  return {
    metadata: {
      tokens_per_month: String(tokensPerMonth),
    },
    recurring: {
      interval,
      interval_count: 1,
    },
  };
}

function subscriptionWithPrice(price) {
  return {
    items: {
      data: [
        {
          price,
        },
      ],
    },
  };
}
