-- Monetization restructure: pack entitlement tier, free monthly allowance, retention tables

ALTER TABLE user_token_balances
  ADD COLUMN IF NOT EXISTS max_entitlement_tier TEXT NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS free_monthly_remaining INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS free_monthly_period TEXT;

COMMENT ON COLUMN user_token_balances.max_entitlement_tier IS 'Highest tier from pack purchases: basic | premium';
COMMENT ON COLUMN user_token_balances.free_monthly_remaining IS 'Free minutes this calendar month (no rollover)';
COMMENT ON COLUMN user_token_balances.free_monthly_period IS 'YYYY-MM period for free_monthly_remaining';

CREATE TABLE IF NOT EXISTS cancellation_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL REFERENCES users(clerk_user_id),
  reason TEXT NOT NULL,
  reason_detail TEXT,
  offer_shown TEXT,
  offer_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancel_surveys_user ON cancellation_surveys (clerk_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS winback_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL REFERENCES users(clerk_user_id),
  email TEXT NOT NULL,
  template_name TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  last_plan TEXT,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_winback_due ON winback_email_queue (due_at) WHERE sent_at IS NULL;

CREATE TABLE IF NOT EXISTS churn_records (
  clerk_user_id TEXT PRIMARY KEY REFERENCES users(clerk_user_id),
  last_plan TEXT,
  cancel_reason TEXT,
  churned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stripe_subscription_id TEXT
);

DO $$ BEGIN
  ALTER TYPE token_tx_type ADD VALUE IF NOT EXISTS 'free_monthly_debit';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
