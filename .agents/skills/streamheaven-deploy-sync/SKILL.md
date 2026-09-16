---
name: streamheaven-deploy-sync
description: Coordinate cross-tier deployments, synchronization, and automated health checks across StreamHeaven's three live environments (Storefront on Cloudflare, Edge Worker on Cloudflare Workers, and Backend Proxy on Render). Make sure to use this skill whenever deploying updates to production, running pre-deploy or post-deploy health verifications, checking CORS or SSL certificates on live domains, verifying git push auto-deploys on Render, or confirming end-to-end playback after updating player or scraper code.
---

# StreamHeaven Deployment & Cross-Tier Synchronization

Procedures for building, deploying, and verifying changes across StreamHeaven's three distributed tiers.

## The Deployment Matrix

| Tier | Directory | Deployment Trigger / Command | Production URL |
|---|---|---|---|
| **Storefront** | `frontend/storefront/` | `npm run deploy` (`astro build && wrangler deploy`) | `https://streamheaven.online` |
| **Edge Worker** | `backend-edge/` | `npm run deploy` (`wrangler deploy`) | `https://streamheaven-edge.sampadchakma22.workers.dev` |
| **Render Backend** | `backend/` | `git push origin main` (Render auto-deploy hook) | `https://steamheaven.onrender.com` |
| **Android App** | `frontend/android-app/` | Gradle assemble release & publish to `storefront/public/StreamHeaven.apk` | Bundled in storefront |

## Pre-Deployment Verification

Before triggering production deployments:
1. **Edge Worker Typecheck**:
   ```bash
   cd backend-edge && npm run typecheck
   ```
2. **Storefront Build Check**:
   ```bash
   cd frontend/storefront && npm run build
   ```
3. **Check Render Git Status**:
   Ensure modifications to `backend/` are committed and pushed to `main` so Render's automated build initiates.

## Post-Deployment Automated Verification

Run the bundled deployment health verification script:

```bash
python .agents/skills/streamheaven-deploy-sync/scripts/verify_deployment.py
```

This script verifies:
1. Storefront root (`https://streamheaven.online`) returns HTTP 200 and loads HTML.
2. Edge Worker health returns HTTP 200 and valid JSON.
3. Render Backend health returns HTTP 200 with `{ ok: true }`.
4. Render stream resolution returns valid streams for benchmark title (Dune Part Two, TMDB 693134).
5. All endpoints inject correct `Access-Control-Allow-Origin: *` headers for cross-origin browser requests.

## Rolling Back

- **Storefront / Edge Worker**: Use Wrangler rollback:
  ```bash
  cd frontend/storefront && npx wrangler rollback
  cd backend-edge && npx wrangler rollback
  ```
- **Render Backend**: Revert the commit on `main` and push to trigger an immediate redeploy on Render.
