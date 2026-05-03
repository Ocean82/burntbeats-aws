# GA4 Conversion Event Map

This document defines the event names and parameters used by the conversion funnel implementation.

## Event Schema

- `paywall_impression`
  - `source`: `split_gate`
  - `status`: subscription status (`inactive`, etc.)
  - `current_plan`: `basic|premium|studio|none`

- `paywall_cta_clicked`
  - `source`: `split_gate`
  - `plan`: `basic|premium|studio|topup|single`

- `checkout_preprompt_shown`
  - `source`: `split_gate`
  - `suggested_plan`: `basic`

- `landing_plan_intent_captured`
  - `source`: `landing_pricing`
  - `plan`: selected plan id

- `pricing_plan_selected`
  - `source`: `pricing_page`
  - `plan`: selected plan id

- `plan_selected`
  - `source`: `split_gate|paywall_banner|pricing_page|upgrade_prompt|unknown`
  - `plan`: selected plan id
  - `intent`: intent hint string

- `checkout_started`
  - `source`: same as above
  - `plan`: selected plan id

- `checkout_redirected`
  - `source`
  - `plan`

- `checkout_returned_success`
  - `source` (optional, e.g. `root_handler`)

- `checkout_returned_cancelled`
  - `source` (optional, e.g. `root_handler`)

- `checkout_failed`
  - `source`
  - `plan`
  - `error`: truncated message

- `subscription_fetch_failed`
  - `category`: `auth|server|other|network_or_unknown`
  - `http_status` (when available)
  - `error` (when available)

- `legal_gate_shown`
  - `tos_version`
  - `privacy_version`

- `legal_accept_submit`
  - `tos_version`
  - `privacy_version`

- `legal_accept_failed`
  - `error`

## Recommended GA4 Funnel

1. `paywall_impression`
2. `plan_selected`
3. `checkout_started`
4. `checkout_redirected`
5. `checkout_returned_success`

Break down by `source`, `plan`, and blocker events (`subscription_fetch_failed`, `legal_accept_failed`) to diagnose drop-off.

