-- Premium beat pattern cloud sync
CREATE TABLE IF NOT EXISTS user_beat_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL REFERENCES users(clerk_user_id),
  name TEXT NOT NULL,
  preset JSONB NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_beat_patterns_user ON user_beat_patterns(clerk_user_id);
