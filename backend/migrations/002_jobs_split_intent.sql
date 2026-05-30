-- Intent-driven split requests (task, targets, mode, quality) for history replay.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_intent JSONB;
