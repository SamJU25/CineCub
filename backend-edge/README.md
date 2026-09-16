# StreamHeaven Edge Backend (`backend-edge/`)

Event-driven rewrite of the StreamHeaven API for Cloudflare Workers. Replaces the
legacy Node/Render backend (`backend/`) with a **cache-first** architecture that
serves stream results instantly and warms popular titles in the background.

## Why this exists

The legacy backend scraped all providers **on every request** with a 25s deadline
(Render free-tier constraints forced keep-alive pings, 45s timeouts, etc.). On
Workers we invert that: aggregate once, cache in KV, serve the rest instantly.

- **On-demand warm:** first request for a title scrapes → caches for 30 min → all
  later requests are instant cache hits.
- **Cron warm:** every 6h, populates the top-N popular movies + series so common
  titles are pre-cached.
- **Queue warm:** the same worker consumes a `warm-streams` queue for targeted
  re-warming / large batches.

## Quickstart

```bash
cd backend-edge
npm install
```

Create resources (one time), then paste ids:

```bash
npx wrangler kv namespace create STREAMS        # -> paste id (KV) into wrangler.toml
npx wrangler r2 bucket create streamheaven-cache
npx wrangler queues create warm-streams
npx wrangler queues create warm-streams-dlq
```

Set secrets (never commit):

```bash
npx wrangler secret put TMDB_API_KEY
npx wrangler secret put FIREBASE_WEB_API_KEY
npx wrangler secret put FEBBOX_COOKIES          # optional
npx wrangler secret put POPULAR_IDS             # optional: "movie:123,series:456"
```

Deploy:

```bash
npx wrangler deploy
```

## Configuration (`wrangler.toml`)

| Key | Meaning |
|-----|---------|
| `STREAMS` (KV) | stream + TMDB memoization cache |
| `MEDIA_CACHE` (R2) | optional response cache for `/proxy` |
| `WARM_QUEUE` | background warm queue (producer + consumer) |
| `APP_URL` | base URL for auth emails / links |
| `ENABLE_PROXY` | `"true"` rewrites stream URLs to `/proxy` |
| `DEFAULT_PROVIDERS` | comma list; order = aggregation order |
| `STREAM_CACHE_TTL_SECONDS` | default `1800` (30 min) |
| `POPULAR_WARM_LIMIT` | default `50` per movie/series |

## API (compatible with legacy)

| Route | Behavior |
|-------|----------|
| `GET /api/streams/:type/:tmdbId` | aggregate, cached |
| `GET /api/streams/:provider/:type/:tmdbId` | single provider |
| `GET /api/health` | health check |
| `GET /api/providers` | provider list |
| `GET /api/status` | status + provider list |
| `GET /proxy?url=...` | optional R2-cached forward proxy |
| `Scheduled` (cron) | warm top-N popular |
| `queue` (consumer) | warm single / batch targets |

Stream response shape is unchanged:

```json
{
  "success": true,
  "tmdbId": "27205",
  "imdbId": "tt1375666",
  "count": 5,
  "providerTimings": { "vidlink": 800 },
  "streams": [ { "name": "Vidlink", "title": "Vidlink - 1080p", "url": "...", "quality": "1080", "provider": "Vidlink", "headers": {} } ],
  "cached": true
}
```

## Providers

All 13 legacy providers are ported to Workers-compatible TS
(`src/providers/*.ts`, no Node built-ins — fetch + in-memory cache + regex):

`vidlink, vixsrc, videasy, streamflix, dahmermovies, castletv, zxcstreams,
netmirror, vaplayer, onetouchtv, hdghartv, showbox, 4khdhub`

The 11 mainstream providers run by default (`DEFAULT_PROVIDERS`).

**Verified provider status (tested live from the Workers runtime via
`/api/streams/:provider/...`)**
- Works from Workers (subject to upstream content availability):
  `vidlink, streamflix, dahmermovies, castletv, zxcstreams, vaplayer, hdghartv,
  netmirror, onetouchtv`
- **`netmirror`** — direct `net27.cc/api/embed-tmdb/{tmdbId}`; returns streams when
  that host has the title, `[]` when it doesn't (e.g. has Fight Club/GoT, not
  Inception). Not a code issue.
- **`onetouchtv`** — AES-CBC search/detail/episode over `api3.devcorp.me`; returns
  streams when the upstream has the title, else the title matcher correctly
  rejects mismatches (e.g. real Fight Club absent upstream).
- **`vixsrc`** — **blocked on Worker egress**: upstream serves a
  Cloudflare "Just a moment" 403 challenge to Cloudflare-Worker IPs (works from
  residential IPs). Effectively unavailable from the Workers runtime; would need
  a residential scraping proxy.
- **`videasy`** — **rate-limited on Worker egress**: upstream `api.speedracelight.com`
  returns HTTP 429 `rate_limited` to the Worker's shared egress (works from
  residential IPs). Effectively unavailable from the Workers runtime.

**Opt-in heavy providers** (ported, but only join a request if added to
`DEFAULT_PROVIDERS` — they hit third-party hosts and add latency):
- `showbox` — FebBox share-link scraper; **VERIFIED WORKING** from Workers.
  Returns nothing unless `FEBBOX_COOKIES` is configured (required to resolve
  playable file URLs via the FebBox `/file/player` endpoint). Ported: fetch +
  regex, in-memory cache (was fs/cheerio). Confirmed producing live HLS streams
  (e.g. Invincible/Inception) from `hls.shegu.net`.
- `4khdhub` — HubDrive/HubCloud host scraper for 4K remuxes. Ported: fetch-based,
  no cookies required (was raw http/net sockets + fs). **But the target site
  `4khdhub.one` Cloudflare-blocks Workers egress IPs (`error code: 1106`)**, so
  it currently returns `[]` from the Workers runtime. Would need a residential
  scraping proxy (e.g. ScraperAPI) to work there — deferred pending a paid key.

`showbox` and `4khdhub` are `portable: true` and `enabled: true` in
`src/lib/registry.ts` but are kept out of the default aggregate to avoid slowing
every request. Add e.g. `DEFAULT_PROVIDERS="vidlink,...,4khdhub"` to opt them in.

## Local dev

```bash
npx wrangler dev --port 8799
# e.g.
curl "http://127.0.0.1:8799/api/streams/movie/27205"
```

First request scrapes (~1.4s); second hits the cache (<100ms).

## Cutover (frontend)

Point the storefront at the Worker URL (instead of `steamheaven.onrender.com`)
in the Next.js storefront once the Worker is live:

- `frontend/next-storefront/src/lib/tmdb.ts` (API base)
- `frontend/next-storefront/src/components/Player.tsx` (stream source fallback)

## Note

Auth (login/session/password-reset) endpoints from the legacy backend are **not**
ported here yet. Those are handled by Firebase Admin + Mailtrap in `backend/` and
remain served by the legacy backend during transition. Port them here when ready.
