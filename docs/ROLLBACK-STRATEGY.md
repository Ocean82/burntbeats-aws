# Rollback Strategy

**Purpose:** Document how to revert a bad deploy on the EC2 production server.

---

## Quick Reference

| Scenario | Method | Downtime |
|----------|--------|----------|
| Bad code (app crashes) | Git revert + rebuild | ~2 min |
| Bad env var | Edit `.env` + restart | ~30 sec |
| Bad Docker image | Tag-based rollback | ~1 min |
| Bad DB migration | Fix forward (no rollback) | Varies |

---

## 1. Git Revert (most common)

When a deploy introduces a bug:

```bash
# On your local machine
git revert HEAD
git push origin main

# On the server
ssh -i ~/.ssh/server_saver_key ubuntu@52.0.207.242
cd /home/ubuntu/burntbeats-aws
git pull --ff-only origin main
sudo docker compose build <service>   # frontend | backend | stem_service
sudo docker compose up -d <service>
```

Verify:
```bash
sudo docker compose ps
curl -fsS http://127.0.0.1:3001/api/health
```

---

## 2. Image-Based Rollback (instant, no rebuild)

**Before each deploy**, tag the current images:

```bash
# Run this BEFORE building new images
TAG=$(date +%Y%m%d-%H%M)
sudo docker tag burntbeats-aws-frontend:latest burntbeats-aws-frontend:pre-$TAG
sudo docker tag burntbeats-aws-backend:latest burntbeats-aws-backend:pre-$TAG
sudo docker tag burntbeats-aws-stem_service:latest burntbeats-aws-stem_service:pre-$TAG
```

**To rollback** (no rebuild needed):

```bash
# Find the tag you want
sudo docker images | grep pre-

# Restore it
sudo docker tag burntbeats-aws-backend:pre-20260512-1430 burntbeats-aws-backend:latest
sudo docker compose up -d backend
```

---

## 3. Environment Variable Rollback

Keep a timestamped backup before changes:

```bash
cp .env .env.bak.$(date +%Y%m%d-%H%M)
```

To rollback:
```bash
cp .env.bak.YYYYMMDD-HHMM .env
sudo docker compose up -d   # restart picks up new env
```

For frontend env changes (baked at build time):
```bash
cp .env.bak.YYYYMMDD-HHMM .env
sudo docker compose build frontend
sudo docker compose up -d frontend
```

---

## 4. Database Migrations

**Policy: fix forward only.** Never `DROP` tables or columns in production.

If a migration breaks:
1. Identify the issue in the migration SQL
2. Write a corrective migration (add back what was removed, fix data)
3. Deploy the fix

If data was corrupted:
1. Check RDS automated backups (AWS Console → RDS → Automated backups)
2. Restore to a point-in-time if needed (creates a new DB instance)
3. Update `DATABASE_URL` to point to the restored instance

---

## 5. Full Stack Rollback (nuclear option)

If everything is broken and you need to get back to a known-good state:

```bash
cd /home/ubuntu/burntbeats-aws

# Stop everything
sudo docker compose down

# Reset to a known-good commit
git log --oneline -10   # find the good commit
git reset --hard <good-commit-sha>

# Rebuild everything from scratch
sudo docker compose build --parallel
sudo docker compose up -d

# Verify
sudo docker compose ps
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:5000/health
```

⚠️ This discards any uncommitted server-side changes. Make sure `.env` files are intact.

---

## 6. Verification After Any Rollback

```bash
# All containers healthy
sudo docker compose ps

# Backend API
curl -fsS http://127.0.0.1:3001/api/health

# Stem service
curl -fsS http://127.0.0.1:5000/health

# Frontend serves HTML
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/

# Webhooks respond (400 = correct, no valid signature)
curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3001/api/billing/webhook
curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3001/api/clerk/webhook

# HTTPS from outside
curl -s -o /dev/null -w '%{http_code}' https://burntbeats.com
```

---

## Prevention

- Always `git pull --ff-only` (never force-push to main)
- Tag images before rebuilding (see section 2)
- Back up `.env` before editing
- Run `bash scripts/check_env.sh` before deploy
- Test locally with `docker compose up` before pushing
