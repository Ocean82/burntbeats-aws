# Conversion Measurement Checklist

Use this checklist after deploying conversion updates.

## Baseline (Before Release)

- Capture current signed-in to paid conversion rate.
- Capture current checkout start to checkout success rate.
- Capture current paywall impression to checkout start CTR.

## Event Health (Day 0-1)

Confirm these events are arriving with `plan` and `source` dimensions:

- `paywall_impression`
- `plan_selected`
- `checkout_started`
- `checkout_redirected`
- `checkout_returned_success`
- `checkout_returned_cancelled`
- `checkout_failed`
- `subscription_fetch_failed`
- `legal_gate_shown`
- `legal_accept_submit`
- `legal_accept_failed`

## Two-Week Review Window

Track for at least 14 days (or until sample size is stable):

- Signed-in -> paid conversion rate
- Checkout started -> checkout success rate
- Paywall impression -> checkout start CTR
- Checkout cancel return rate
- Subscription/legal blocker rates
- Share of first purchases by one-time pack vs subscription

## Decision Rules

- Keep changes if conversion improves and checkout success rate does not regress.
- If checkout starts rise but success falls, inspect `checkout_failed` and `checkout_returned_cancelled` by `source`.
- If blockers rise, prioritize auth/legal UX and retry guidance.

