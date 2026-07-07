-- Referral program: codes + attributions

CREATE TABLE IF NOT EXISTS referral_codes (
  clerk_user_id TEXT PRIMARY KEY REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes (code);

CREATE TABLE IF NOT EXISTS referral_registrations (
  referee_user_id TEXT PRIMARY KEY REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  referrer_user_id TEXT NOT NULL REFERENCES users(clerk_user_id),
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_registrations_referrer
  ON referral_registrations (referrer_user_id);
