# Operational Hardening Plan

**Date:** 2026-05-12
**Scope:** Database hygiene, job lifecycle fixes, disk management, deploy safety, Sentry release tagging

---

## 1. Clean Up Phantom Test Jobs

**Effort:** 10 minutes | **Risk:** None

Delete the 22 orphan "accepted" jobs that have no user, no disk output, and no real purpose.

### Steps

1. Run cleanup query on production DB:
   ```sql
   DELETE FROM jobs
   WHERE status = 'accepted'
     AND clerk_user_id IS NULL
     AND job_id NOT IN (
       SELECT job_id FROM token_transactions WHERE job_id IS NOT NULL
     );
   ```
2. Verify: `SELECT COUNT(*) FROM jobs WHERE clerk_user_id IS NULL;` → should be 0 (or only the 2 test-seed completed jobs)

---

## 2. Populate `started_at` Timestamp

**Effort:** 15 minutes | **Risk:** Low

The `jobs.started_at` column exists but is never set. It should be populated when the stem service begins processing.

### Root Cause

The backend sets `status = 'accepted'` on insert but never updates to `'processing'` with a `started_at` timestamp. The SSE fix we just deployed now calls `updateJobStatus(job_id, "processing")` which sets `started_at = now()` in `db-jobs.js` — but only if the client is connected and streaming at that moment.

### Fix

In `backend/routes/stems/split.js`, after the stem service accepts the job (returns 202), immediately call:
```javascript
updateJobStatus(job_id, "processing").catch(() => {});
```

This ensures `started_at` is set as soon as the job is dispatched, regardless of whether the client is streaming.

### Files to Modify

- `backend/routes/stems/split.js` — add `updateJobStatus` call after stem service 202 response
- Verify `backend/db-jobs.js` `updateJobStatus("processing")` sets `started_at = now()` (it already does per line 89-90)

---

## 3. Investigate and Wire Up `stems` Table

**Effort:** 1–2 hours | **Risk:** Low

The `stems` table exists with columns (`id`, `job_id`, `stem_name`, `s3_key`, `file_size_bytes`, `created_at`) but has 0 rows. Either:
- (A) It's intended for S3-uploaded stems and isn't used because S3 upload is optional/disabled
- (B) The `recordJobStems()` function in `db-jobs.js` is never called

### Investigation Steps

1. Check if `recordJobStems` is exported from `db-jobs.js`
2. Search for callers: `grep -rn 'recordJobStems' backend/`
3. Check if S3 upload logic calls it after uploading stems
4. Decision:
   - If S3 is disabled (`S3_ENABLED=false`), the table stays empty by design — document this
   - If S3 is enabled but stems aren't recorded, wire up the call in the S3 upload success path

### Expected Outcome

Either:
- Document that `stems` table is only populated when `S3_ENABLED=true` (and S3 upload succeeds)
- Or wire up `recordJobStems()` in the appropriate place

---

## 4. Job Output Disk Cleanup Policy

**Effort:** 1 hour | **Risk:** Low-Medium (must not delete active jobs)

140 job folders in `tmp/stems/` with no cleanup. As usage grows, disk will fill.

### Design

Add a cron job (or a script triggered by deploy) that deletes job output folders older than N days.

### Implementation

Create `scripts/cleanup-old-stems.sh`:
```bash
#!/bin/bash
# Delete stem job output folders older than 7 days.
# Safe: only deletes folders where progress.json shows completed/failed.
STEM_DIR="${STEM_OUTPUT_DIR:-/home/ubuntu/burntbeats-aws/tmp/stems}"
MAX_AGE_DAYS="${STEM_CLEANUP_DAYS:-7}"

find "$STEM_DIR" -maxdepth 1 -type d -mtime +$MAX_AGE_DAYS | while read dir; do
  progress="$dir/progress.json"
  if [ -f "$progress" ]; then
    status=$(python3 -c "import json; print(json.load(open('$progress'))['status'])" 2>/dev/null)
    if [ "$status" = "completed" ] || [ "$status" = "failed" ] || [ "$status" = "cancelled" ]; then
      echo "Removing $dir (status=$status, age > ${MAX_AGE_DAYS}d)"
      rm -rf "$dir"
    fi
  fi
done
```

### Deployment

Add a cron entry on the server:
```bash
# Daily at 3am UTC — clean up old stem job output
0 3 * * * /home/ubuntu/burntbeats-aws/scripts/cleanup-old-stems.sh >> /var/log/stem-cleanup.log 2>&1
```

### Safety

- Only deletes folders with terminal status in `progress.json`
- Never deletes folders without `progress.json` (could be in-progress)
- Configurable retention via `STEM_CLEANUP_DAYS` env var (default 7)

---

## 5. Rollback Strategy Documentation

**Effort:** 1 hour | **Risk:** None (documentation only)

Document how to roll back a bad deploy. The current setup uses Docker Compose with `git pull` + `docker compose build` + `up -d`.

### Create `docs/ROLLBACK-STRATEGY.md`

Contents:
1. **Quick rollback (< 2 min):** `git revert HEAD && git push && git pull (on server) && docker compose build <service> && docker compose up -d`
2. **Image-based rollback:** Tag images before deploy (`docker tag burntbeats-aws-backend:latest burntbeats-aws-backend:pre-deploy-YYYYMMDD`), then `docker tag :pre-deploy :latest && docker compose up -d`
3. **Database rollback:** Document that DB migrations are forward-only; if a migration breaks, fix forward (no `DROP` in production)
4. **Env var rollback:** Keep a timestamped backup of `.env` before changes (`cp .env .env.bak.YYYYMMDD`)
5. **Verification after rollback:** Health checks, webhook test, stem service health

---

## 6. Add `SENTRY_RELEASE` to Deploys

**Effort:** 30 minutes | **Risk:** None

Tag Sentry events with the git SHA so errors correlate with specific deployments.

### Implementation

In `deploy-to-ec2.sh` (or the git pull workflow on server), set:
```bash
export SENTRY_RELEASE=$(git rev-parse --short HEAD)
export VITE_SENTRY_RELEASE=$SENTRY_RELEASE
```

Add to root `.env` on server after each deploy:
```bash
# Auto-set by deploy script
SENTRY_RELEASE=$(cd /home/ubuntu/burntbeats-aws && git rev-parse --short HEAD)
```

Or simpler: add to `docker-compose.yml` environment with a default:
```yaml
SENTRY_RELEASE: ${SENTRY_RELEASE:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}
```

Note: For the frontend, `VITE_SENTRY_RELEASE` is baked at build time, so it needs to be set before `docker compose build frontend`.

---

## Execution Order

| # | Task | Effort | Deploy Required |
|---|------|--------|-----------------|
| 1 | Clean phantom jobs | 10 min | No (DB only) |
| 2 | Populate `started_at` | 15 min | Yes (backend rebuild) |
| 3 | Investigate `stems` table | 1 hour | Maybe |
| 4 | Disk cleanup script + cron | 1 hour | Yes (server config) |
| 5 | Rollback strategy docs | 1 hour | No |
| 6 | Sentry release tagging | 30 min | Yes (deploy script) |

**Total estimated effort: ~4 hours**

---

## Success Criteria

- [ ] 0 phantom jobs in DB
- [ ] New jobs have `started_at` populated
- [ ] `stems` table purpose documented (or wired up)
- [ ] Cron job cleaning old stem folders daily
- [ ] Rollback procedure documented and tested
- [ ] Sentry events tagged with git SHA
- [ ] Disk usage stays below 80% with normal traffic
