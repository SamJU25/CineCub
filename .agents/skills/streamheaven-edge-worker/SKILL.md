---
name: streamheaven-edge-worker
description: Develop, test, optimize, and deploy the Cloudflare edge Worker in backend-edge/. Make sure to use this skill whenever modifying Edge Worker API routes, debugging or adding scrapers in backend-edge/src/providers/, configuring Wrangler settings (wrangler.toml), managing Cloudflare KV (STREAMS) or R2 (MEDIA_CACHE) bindings, tuning warm-queue background workers, updating the 10-minute Render keep-alive cron (pingRenderKeepAlive), or managing provider aggregation and rate limiting.
---

# StreamHeaven Edge Worker Development & Maintenance

This skill covers development, testing, configuration, and deployment for the Cloudflare edge Worker in `backend-edge/` (`streamheaven-edge`).

## Responsibilities of the Edge Worker

1. **Stream Aggregation API**: Receives requests at `/api/streams/movie/:id` and `/api/streams/series/:id` and aggregates results from multiple provider scrapers.
2. **Render Keep-Alive Cron**: Dispatches an HTTP GET to `https://steamheaven.onrender.com/api/health` every 10 minutes to prevent Render free-tier spindown.
3. **KV Stream Caching**: Caches aggregated stream results in Cloudflare KV (`STREAMS`) with a short TTL (180s) to absorb spikes without returning stale signed media URLs.
4. **Queue & Background Warming**: Pre-scrapes top trending titles into KV using `WARM_QUEUE`.

## Key Files Map

| Path | Purpose |
|---|---|
| `backend-edge/wrangler.toml` | Worker configuration, bindings (KV, R2, Queues), crons, env vars |
| `backend-edge/src/index.ts` | Main fetch handler, router, and `scheduled` cron dispatcher |
| `backend-edge/src/warm.ts` | Popular title warming & queue consumer |
| `backend-edge/src/lib/aggregate.ts` | Runs provider scrapers in parallel with timeout safeguards |
| `backend-edge/src/lib/streamCache.ts` | KV cache reads/writes with TTL management |
| `backend-edge/src/providers/*.ts` | Scraper modules (vidlink, vaplayer, 4khdhub, castletv, etc.) |

## Scheduled Crons (`wrangler.toml`)

```toml
[triggers]
crons = ["0 */6 * * *", "*/10 * * * *"]
```

- `0 */6 * * *`: Runs `warmPopularTitles()` to pre-cache the top 50 trending movies and TV shows.
- `*/10 * * * *`: Runs `pingRenderKeepAlive()`:
  ```typescript
  async function pingRenderKeepAlive(env: Env): Promise<void> {
    const url = `${renderBaseUrl(env)}/api/health`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'StreamHeaven-Edge-KeepAlive/1.0' } });
      console.log(`[cron] pingRenderKeepAlive: ${res.status}`);
    } catch (e) {
      console.warn(`[cron] pingRenderKeepAlive failed:`, e);
    }
  }
  ```

## Critical Rule: Cloudflare Datacenter Egress Blocks

Certain upstream hosts (e.g. `4khdhub.mx`, `bcdn.hakunaymatata.com`, `cf.streamflixserver.site`) deliberately reject Cloudflare Worker datacenter IP ranges with HTTP error 1106, 403, or 427.

- **DO NOT** spend hours rewriting scrapers in `backend-edge/src/providers/` to fix error 1106; it is an egress network block enforced by Cloudflare's own bot protection against other Cloudflare Worker IPs.
- Instead, Render's server IP is accepted by these hosts. The edge worker's `preparePlayable()` rewrites 4KHDHub URLs to Render's `/ts-proxy`, and the storefront player fetches directly from Render.

## Development & Deployment Workflow

Always run these commands from the `backend-edge/` directory:

1. **Typecheck before committing or deploying**:
   ```bash
   cd backend-edge && npm run typecheck
   ```
2. **Local testing**:
   ```bash
   cd backend-edge && npx wrangler dev
   ```
3. **Deploy to Cloudflare Workers**:
   ```bash
   cd backend-edge && npm run deploy
   ```
   Live Worker route: `https://streamheaven-edge.sampadchakma22.workers.dev`
