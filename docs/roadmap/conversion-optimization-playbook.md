# Conversion Optimization Playbook

This playbook is a practical weekly operating guide to improve purchase conversion.
Use it with:

- `docs/roadmap/conversion-measurement-checklist.md`
- `docs/roadmap/ga4-conversion-events.md`

## Objective

Increase paid conversion by improving the funnel in sequence:

1. `paywall_impression -> plan_selected`
2. `plan_selected -> checkout_started`
3. `checkout_started -> checkout_returned_success`

## Core KPIs

- Primary:
  - Signed-in -> paid conversion rate
  - Checkout completion rate (`checkout_returned_success / checkout_started`)
- Secondary:
  - `plan_selected / paywall_impression`
  - `checkout_returned_cancelled` rate
  - Blocker rates (`subscription_fetch_failed`, `legal_accept_failed`)
  - First purchase mix (one-time vs subscription)

## Week-by-Week Plan

### Week 1: Improve Plan Selection Rate

Focus step: `paywall_impression -> plan_selected`

- Experiment A (Offer clarity)
  - Keep two primary first-view choices:
    - `Continue to checkout · Basic`
    - `Continue to checkout · Top-Up`
  - Move other plans behind a secondary action (for example, `See all plans`).
- Experiment B (Trust strip)
  - Keep concise trust copy directly under CTA:
    - `Secure Stripe checkout · cancel anytime · no hidden overages`

Success target:

- +20% on `plan_selected / paywall_impression`

Stop condition:

- If checkout completion drops by >5%, roll back the variant.

### Week 2: Improve Checkout Starts

Focus step: `plan_selected -> checkout_started`

- Experiment C (Reduce CTA friction)
  - Reduce pre-checkout copy to one short sentence.
  - Keep one dominant CTA label: `Continue to secure checkout`.
- Experiment D (Cost certainty)
  - When file is already uploaded, show estimated token cost near CTA.

Success target:

- +10-15% on `checkout_started / plan_selected`

Stop condition:

- If cancellation rate rises materially, roll back cost-message variant.

### Week 3: Improve Checkout Completion

Focus step: `checkout_started -> checkout_returned_success`

- Experiment E (Cancel recovery)
  - Strengthen post-cancel recovery banner:
    - Retry checkout
    - One-time pack shortcut
- Experiment F (Commitment matching)
  - For first-time users at split gate, bias default toward one-time pack.

Success target:

- +10% on `checkout_returned_success / checkout_started`
- -15% on `checkout_returned_cancelled`

Stop condition:

- If total purchases decrease, remove default bias and keep recovery UX only.

## Weekly Cadence

### Monday: Measurement Pull

Review 7-day and 28-day metrics for:

- `paywall_impression`
- `plan_selected`
- `checkout_started`
- `checkout_returned_success`
- `checkout_returned_cancelled`
- `subscription_fetch_failed`
- `legal_accept_failed`

Always segment by:

- `source`
- `plan`

### Friday: Decision and Rollout

- Identify the earliest funnel step with the largest drop-off and enough volume.
- Keep one major UX lever per step per week for clean attribution.
- Keep winner, remove loser, then move to the next step.

## Decision Matrix

- If `paywall_impression -> plan_selected` is low:
  - Improve offer clarity and trust messaging.
- If `plan_selected -> checkout_started` is low:
  - Reduce CTA friction and improve pricing certainty at decision point.
- If `checkout_started -> checkout_returned_success` is low:
  - Improve cancel recovery and lower perceived commitment.
- If `subscription_fetch_failed` is high:
  - Prioritize auth/session recovery UX.
- If `legal_accept_failed` is high:
  - Prioritize legal acceptance recovery UX and version-sync checks.

## Tracking Template

Use the table below each week:

| Week | Main Experiment | Step Targeted | Baseline | Result | Decision | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  | paywall -> plan_selected |  |  |  |  |
| 2 |  | plan_selected -> checkout_started |  |  |  |  |
| 3 |  | checkout_started -> success |  |  |  |  |

## Guardrails

- Do not ship multiple large funnel changes in one week if attribution matters.
- Require minimum sample thresholds before declaring a winner.
- Prefer reversible UI changes first, then deeper logic changes.
- Keep event schema stable while experiments run.

