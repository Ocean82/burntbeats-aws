# Marketing pricing page (`burnt-beats-pricing-structure/`)

**Purpose:** The standalone **full pricing & features** page (static HTML/JS/CSS). The main app links to it via **`VITE_FULL_PRICING_URL`** (default `https://www.burntbeats.com/pricing`) and the **“Full pricing & features”** button in the header / mobile menu.

**Not part of Docker Compose.** Root **`docker-compose.yml`** only builds **`frontend/`**, **`backend/`**, and **`stem_service/`**. This folder is a **separate Vite app**; deploy its output independently from the SPA container.

---

## When to redeploy

- Any change under **`burnt-beats-pricing-structure/src/`** (or its `index.html`, Tailwind config, etc.).
- After deploy, hard-refresh or invalidate CDN cache if the live URL is behind CloudFront or similar.

---

## Build (local or CI)

From repo root:

```bash
cd burnt-beats-pricing-structure
npm ci
npm run build
```

Artifacts: **`burnt-beats-pricing-structure/dist/`** (or the path your `vite.config` uses).

---

## Ship to production

Depends on hosting (examples):

| Hosting pattern | What to upload |
|-----------------|----------------|
| S3 + CloudFront | Contents of **`dist/`** to the bucket/prefix that backs **`/pricing`** |
| Nginx on a VM | **`dist/`** files to the document root or `alias` path for that URL |
| Another static host | Follow that provider’s “upload build output” flow |

The main app’s **[DEPLOY-DOCKER-EC2.md](DEPLOY-DOCKER-EC2.md)** / **`docker compose build frontend`** steps **do not** publish this site.

---

## Included in repo bundles

**[DEPLOY-SERVER-BUNDLE.md](DEPLOY-SERVER-BUNDLE.md)** (`scripts/package-server-bundle.sh` / `rsync --exclude-from=scripts/deploy-exclude.txt`) **includes** `burnt-beats-pricing-structure/` source (it is not in `deploy-exclude.txt`). On the server you still must **`npm ci && npm run build`** in that directory (or build in CI and copy **`dist/`** only) to produce static files.

---

## Related

- Root **[README.md](../README.md)** — main app deploy (Compose vs tarball).
- **`frontend/`** in-app pricing: **`PricingPage`** component — deployed with **`docker compose build frontend`**.
