-- Add unique constraint on (job_id, stem_name) to support upsert behavior
-- in insertStems(). Prevents duplicate rows from repeated status polls while
-- allowing S3 key updates when the async upload completes after initial insert.
--
-- Idempotent — safe to run multiple times without error.

-- Remove any duplicates first (keep the earliest row)
DELETE FROM stems a
USING stems b
WHERE a.job_id = b.job_id
  AND a.stem_name = b.stem_name
  AND a.created_at > b.created_at;

-- Add the constraint (idempotent — skips if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stems_job_id_stem_name_key'
  ) THEN
    ALTER TABLE stems ADD CONSTRAINT stems_job_id_stem_name_key UNIQUE (job_id, stem_name);
  END IF;
END $$;
