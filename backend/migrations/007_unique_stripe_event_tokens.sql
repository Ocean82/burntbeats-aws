-- Ensure Stripe webhook credit events cannot be credited twice.
--
-- Existing databases created idx_token_tx_stripe_ev as a non-unique partial
-- index. If duplicate event rows already exist, keep the oldest row as the
-- idempotency marker and rename later duplicate markers so the unique index can
-- be installed without deleting ledger history.

WITH ranked_events AS (
  SELECT
    id,
    stripe_event_id,
    ROW_NUMBER() OVER (
      PARTITION BY stripe_event_id
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM token_transactions
  WHERE stripe_event_id IS NOT NULL
)
UPDATE token_transactions tx
SET stripe_event_id = CONCAT(tx.stripe_event_id, ':duplicate:', tx.id::text)
FROM ranked_events ranked
WHERE tx.id = ranked.id
  AND ranked.duplicate_rank > 1;

DROP INDEX IF EXISTS idx_token_tx_stripe_ev;

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_tx_stripe_ev
  ON token_transactions (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
