-- ============================================================================
-- BurntBeats RDS schema  (PostgreSQL 14+)
-- Run once via:  node backend/db-migrate.js
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid() fallback

-- ── ENUM types ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE job_status AS ENUM (
    'accepted', 'processing', 'completed', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE stem_quality AS ENUM (
    'speed', 'balanced', 'quality', 'ultra'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE token_tx_type AS ENUM (
    'debit',           -- split / expand / server-export
    'refund',          -- failed job refund
    'subscription',    -- monthly Stripe subscription credit
    'topup',           -- one-time Stripe purchase
    'welcome',         -- signup welcome grant
    'admin'            -- manual adjustment
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Users (lightweight mirror of Clerk) ─────────────────────────────────────
-- Authoritative auth stays in Clerk; this table caches the fields we query
-- frequently so we don't round-trip to the Clerk API on every DB operation.
CREATE TABLE IF NOT EXISTS users (
  clerk_user_id    TEXT PRIMARY KEY,
  email            TEXT,
  stripe_customer_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── User token balances ─────────────────────────────────────────────────────
-- Single row per user. Updated transactionally alongside token_transactions.
CREATE TABLE IF NOT EXISTS user_token_balances (
  clerk_user_id    TEXT PRIMARY KEY REFERENCES users(clerk_user_id),
  balance          INTEGER NOT NULL DEFAULT 0,
  period_end       TIMESTAMPTZ,                       -- current billing period end
  last_credited_period_start BIGINT,                  -- Stripe period_start (epoch sec)
  welcome_granted  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Token transactions (append-only ledger) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS token_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id    TEXT NOT NULL REFERENCES users(clerk_user_id),
  tx_type          token_tx_type NOT NULL,
  amount           INTEGER NOT NULL,                  -- positive = credit, negative = debit
  balance_after    INTEGER NOT NULL,                  -- snapshot after this tx
  job_id           UUID,                              -- nullable FK to jobs
  stripe_event_id  TEXT,                              -- idempotency for Stripe webhooks
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_tx_user      ON token_transactions (clerk_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_tx_stripe_ev ON token_transactions (stripe_event_id) WHERE stripe_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_token_tx_job       ON token_transactions (job_id) WHERE job_id IS NOT NULL;

-- ── Jobs (stem separation requests) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  job_id           UUID PRIMARY KEY,
  clerk_user_id    TEXT REFERENCES users(clerk_user_id),
  status           job_status NOT NULL DEFAULT 'accepted',
  stems            SMALLINT NOT NULL DEFAULT 4,       -- 2 or 4
  quality          stem_quality,
  is_sample        BOOLEAN NOT NULL DEFAULT FALSE,
  original_filename TEXT,
  duration_seconds REAL,
  token_cost       INTEGER NOT NULL DEFAULT 0,
  model_name       TEXT,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user   ON jobs (clerk_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status) WHERE status IN ('accepted', 'processing');

-- ── Stems (individual output files per job) ─────────────────────────────────
-- NOTE: This table is only populated when S3_ENABLED=true and stems are uploaded
-- to S3 after job completion. When stems are served from local disk (default),
-- this table remains empty. See backend/db-jobs.js insertStems().
CREATE TABLE IF NOT EXISTS stems (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  stem_name        TEXT NOT NULL,                     -- vocals, drums, bass, other, instrumental
  s3_key           TEXT,                              -- S3 object key (when uploaded)
  file_size_bytes  BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stems_job ON stems (job_id);

-- ── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_user_token_balances_updated_at
    BEFORE UPDATE ON user_token_balances FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
