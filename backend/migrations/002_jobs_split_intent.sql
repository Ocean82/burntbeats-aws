-- Intent-driven split requests (task, targets, mode, quality) for history replay.
-- Canonical definition for new databases: backend/db-schema.sql (jobs.split_intent).
-- This migration upgrades existing databases created before that column was added.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_intent JSONB;
