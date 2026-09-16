# StreamHeaven — Architecture (detailed)

> In-depth technical reference for how StreamHeaven is built and how a request flows.
> Last updated: 2026-09-03.

---

## 1. Big picture

StreamHeaven is a **split / multi-layer architecture**:

- A **storefront** (Next.js 16 + React 19 on Cloudflare Workers via OpenNext) = the user-facing site + native ad-free/direct player.
- A **Cloudflare edge Worker** (`backend-edge/`) = general API, stream aggregation, cache, and keep-alive scheduler.
- A **Node/Express backend** (`backend/`) deployed to **Render free tier** = the reliable proxy that makes native MP4/MKV ad-free playback actually work.
- An **Android app** (`frontend/android-app/`) = a small native updater/bootstrap that loads the site.

```
                    +--------------------------------------------+
                    |            USER  (browser / Android)        |
                    +--------------------------------------------+
                          | (1) visit https://cinecub.stream
                          v
    +--------------------------------------------------------------+
    | (A) STOREFRONT  frontend/next-storefront -> Cloudflare Worker |
    |     cinecub.stream + www.cinecub.stream                      |
    |     Next.js 16 + React 19 + Tailwind CSS v4 + Zustand        |
    +--------------------------------------------------------------+
         | normal Watch tab (iframes, ad-supported)  |  ad-free/direct path
         v                                           v
    +-----------------------------+      +--------------------------------------+
    | (B) EDGE WORKER backend-edge|      | (C) RENDER BACKEND  backend/         |
    |     streamheaven-edge...     |      |     steamheaven.onrender.com          |
    |     /api/streams aggregation |      |     API + /m3u8-proxy + /ts-proxy    |
    |     crons: 6h warm,          |      |     (server IP bypasses CDN blocks)  |
    |     10min keep-Render-alive  |      +--------------------------------------+
    +-----------------------------+            | fetches real media from
                                               v
                                  upstream file hosts (pixeldrain,
                                  video-downloads.googleusercontent.com, ...)
```

---

## 2. Layer (A) — Storefront  `frontend/next-storefront/`

**Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Zustand, OpenNext Cloudflare adapter (`@opennextjs/cloudflare`), Wrangler.

**Deployment:** `npm run deploy` = `opennextjs-cloudflare && wrangler deploy`.
Routes (`wrangler.jsonc`): `cinecub.stream/*` and `www.cinecub.stream/*` on zone `cinecub.stream`.

**Key config:**
- `next.config.ts` — image optimization, caching rules.
- `wrangler.jsonc` — Worker name `cinecub-next`, compatibility date `2024-09-23`, compatibility flags `["nodejs_compat"]`.

**Directory / file map:**
| Path | Role |
|---|---|
| `src/app/page.tsx` | Home page with hero spotlight, carousels, continue watching. |
| `src/app/movie/[id]/page.tsx`, `src/app/series/[id]/page.tsx` | SSR detail / watch pages. |
| `src/app/anime/page.tsx`, `genres/`, `trending/` | Browse & category discovery pages. |
| `src/components/Player.tsx` | Integrated video player (HLS.js, native MP4/MKV, embed fallbacks). |
| `src/components/DetailModal.tsx` | Interactive movie/series quick-view modal. |
| `src/lib/store.ts` | Zustand store for continue watching, watchlist, bookmarks, and guest state. |
| `src/lib/tmdb.ts` | TMDB API clients and metadata formatters. |
| `src/lib/subtitles.ts` | Multi-language subtitle search and parser. |
| `public/CineCub.apk` | Bundled Android APK for direct download. |
| `public/version.json` | APK/update version metadata (checked by Android app). |
| `public/assets/*` | Brand assets, favicons, avatar presets, logos. |

**Two playback modes:**
1. **Normal "Watch" tab** — loads third-party **iframe embed** players (ad-supported). Self-hosted/bed-free approach.
2. **"Ad-Free Watch" / direct native player** — **no iframe**; fetches stream URLs from the backend and renders them in a native `<video>` (MP4/MKV) or Hls.js (m3u8). This is the feature that was broken and fixed.

**Player wiring (in `public/script.js`):**
- `RENDER_API = 'https://steamheaven.onrender.com'` and `DIRECT_FROM_RENDER = true` at the top.
- Both ad-free and direct fetch blocks call `RENDER_API + '/api/streams/' + type + '/' + id` (movies) or `.../series/:id?season=&episode=` (TV).
- `prioritizeFileStreams()` — sorts native MP4/MKV file-host sources (`/ts-proxy?` or `.mp4/.mkv/.webm/.mov`) to the **front**; both players auto-select index 0, so the default now plays.
- Stream-type detection: `/m3u8-proxy` → HLS (Hls.js); `/ts-proxy` or `.mp4`/`.mkv` → MP4 (`<video>`).

---

## 3. Layer (B) — Edge Worker  `backend-edge/`

**Stack:** TypeScript + Cloudflare Workers (event-driven: Queues + KV + R2), Wrangler.

**Deployment:** `npm run deploy` (from `backend-edge/`).
Route: `https://cinecub.sampadchakma22.workers.dev` (`workers_dev = true`).

**Key config (`wrangler.toml`):**
| Key | Value | Purpose |
|---|---|---|
| `[triggers] crons` | `["0 */6 * * *", "*/10 * * * *"]` | Warm popular titles every 6h; **keep Render alive every 10 min**. |
| `[[kv_namespaces]] STREAMS` | id `8ef1ce1a…` | Cache stream results (bounded TTL). |
| `[[r2_buckets]] MEDIA_CACHE` | bucket `streamheaven-cache` | Proxy media blob cache. |
| `[[queues.*]] WARM_QUEUE` | `warm-streams` (+ DLQ) | Background pre-scrape queue. |
| `[vars] ENABLE_PROXY` | `"false"` | Direct mode default (see note below). |
| `[vars] DEFAULT_PROVIDERS` | `vidlink,vixsrc,videasy,streamflix,dahmermovies,castletv,zxcstreams,netmirror,vaplayer,onetouchtv,hdghartv` | Which providers the edge aggregates. |
| `[vars] DIRECT_PROVIDERS` | `vidlink,vaplayer` | Marked `playable=true` for the native player. |
| `[vars] STREAM_CACHE_TTL_SECONDS` | `180` | 3-min cache (signed URLs expire ~60s). |
| `[vars] POPULAR_WARM_LIMIT` | `50` | Titles warmed by cron. |
| `[vars] RENDER_BASE_URL` | `https://steamheaven.onrender.com` | Keep-alive target. |

**Directory / file map:**
| Path | Role |
|---|---|
| `src/index.ts` | HTTP entry, routing, `scheduled` handler (`pingRenderKeepAlive()`), `preparePlayable()` (marks 4KHDHub playable + rewrites to Render `/ts-proxy`). |
| `src/warm.ts` | Cron/queue warm logic. |
| `src/lib/config.ts` | `Env` type, `renderBaseUrl()`, `directProviders()`, `enableProxy()`. |
| `src/lib/aggregate.ts` | Runs providers, merges + filters stream lists. |
| `src/lib/registry.ts` | Provider registry. |
| `src/lib/streamCache.ts` | KV cache helpers. |
| `src/lib/streamFilters.ts` | Post-processing/filtering. |
| `src/lib/rateLimit.ts` | Request rate limiting. |
| `src/lib/auth.ts` | Auth middleware. |
| `src/lib/{tmdb,cinemetaEpisodes,titleMatch,tmdbTitleToImdb}.ts` | Metadata / episode lookups. |
| `src/proxy/proxyHandler.ts` | Optional `/proxy` route (currently disabled/403 when `ENABLE_PROXY=false`). |
| `src/providers/*.ts` | One scraper per source (vidlink, vaplayer, 4khdhub, castletv, …). |
| `src/types/index.ts` | Shared stream types. |

**Known edge limitation:** `4khdhub.mx` blocks the Worker's datacenter egress (error 1106) at the *search* step → the edge's 4KHDHub scraper returns `[]`. Render's copy resolves 4KHDHub independently (see next section).

---

## 4. Layer (C) — Render backend  `backend/`

**Stack:** Node/Express (fork/derivative of `Inside4ndroid/TMDB-Embed-API`, aka `tmdb-embed-api`). CORS enabled globally. This is the layer that makes native playback actually work because Render runs on a **server IP** the file-host CDNs accept.

**Deployment / live URL:** `https://steamheaven.onrender.com`.
> NOTE: `backend/render.yaml` still declares service `streamheaven-server` / repo `SamJU25/streamheaven-server`. The **actual live service is named `steamheaven`** (per the running URL). Auto-deploys from the GitHub `main` branch on push; free tier sleeps after ~15 min idle (kept awake by the edge Worker cron).

**Key config (`render.yaml`):** `runtime: node`, `plan: free`, `healthCheckPath: /api/health`, `startCommand: node apiServer.js`. Notable env: `ENABLE_PROXY=true`, plus `TMDB_API_KEY`, `FEBBOX_COOKIES`, Firebase/Mailtrap secrets (`sync: false`).

**Directory / file map:**
| Path | Role |
|---|---|
| `apiServer.js` | Express server, middleware, auth, metrics, health, providers, streaming routes. |
| `proxy/proxyServer.js` | `/m3u8-proxy` + `/ts-proxy` rewrite/relay (HLS segment rewriting, Range clamp, tail prefetch, CORS injection). |
| `providers/*.js` | One scraper per source (4khdhub, castletv, dahmermovies, hdghartv, netmirror, onetouchtv, registry.js, showbox, streamflix, vaplayer, videasy, vidlink, vixsrc, zxcstreams). |
| `utils/*.js` | auth, config, cinemetaEpisodes, jsunpack, mailer, streamFilters, titleMatch, tmdb, tmdbKey, tmdbTitleToImdb, user-config. |
| `public/*` | A small bundled admin/config UI (config.html, index.html, index.js, login.js, style.css). |
| `scripts/publish-docker.ps1`, `Dockerfile`, `docker-compose.yml` | Container / local run options. |
| `DEPLOY-ORACLE.md` | Deploy-guide (Oracle + an ALTERNATIVE Render section). |
| `README.md`, `CHANGELOG.md`, `LICENSE.md` | Project docs. |

**Routes (from `apiServer.js`):**
- `POST /auth/login`, `/auth/logout`, `/auth/change-password`, `/api/auth/forgot-password` — mail/OAuth auth.
- `GET /api/config`, `POST /api/config` (auth) — per-user config.
- `GET /api/health` — **keep-alive target** (returns `{ok:true,…}`).
- `GET /api/metrics`, `/api/status` — runtime metrics.
- `GET /api/providers` (+ `:name`) — provider registry introspection.
- `GET /api/streams/:type/:tmdbId` — **main stream endpoint** (movie|series). Returns streams whose URLs are already rewritten through `/m3u8-proxy` / `/ts-proxy` when `ENABLE_PROXY=true`.
- `GET /api/streams/:provider/:type/:tmdbId` — single-provider variant.
- `GET /m3u8-proxy?url=&headers=` — fetch an HLS `.m3u8`, **rewrite inner variant/segment URLs back through the proxy** so the browser never calls the upstream CDN (avoids CORS + Referer). Segment rewriting now proxies **all** non-`.m3u8` URI lines (fixed `.html`/`.m4s`/`.aac` hosts).
- `GET /ts-proxy?url=&headers=` — fetch a media file (MP4/MKV/TS/`.m4s`) from upstream and relay bytes with `Access-Control-Allow-Origin`.

---

## 5. Android app  `frontend/android-app/`

A lean native **update/bootstrap** app (Kotlin): it installs or updates the bundled APK and launches the StreamHeaven site. Kotlin classes:
- `MainActivity.kt`, `AppUpdater.kt` (package `online.streamheaven.app`).
- Gradle (Kotlin DSL): `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, `gradlew(.bat)`, `keystore.properties(.example)`, `local.properties`, `proguard-rules.pro`.
- Resources: XML layouts/drawables (`activity_main.xml`, dialogs, launcher icons).
- Reads update info from the storefront `version.json`; deep-linking via `assetlinks.json` on the site.

**Build artifacts** (`/build`, `.gradle/`) are gitignored; signing keys (`*.jks`) are gitignored for security. The built APK is published to the storefront at `public/StreamHeaven.apk`.

---

## 6. Reference repo (the technique we borrowed)

`Inside4ndroid/TMDB-Embed-API` was cloned to `C:\Users\TendaSC\AppData\Local\Temp\opencode\tmdbapi\` and used as the basis for the Render backend:
- `proxy/proxyServer.js` → origin of the `/m3u8-proxy` / `/ts-proxy` rewrite + Range clamp + tail prefetch approach.
- `apiServer.js` → origin of the API shape.
- `README.md` → deployment notes.

Key insight validated: this proxy is **not magic**. It fixes CORS/Range/headers for hosts that already tolerate server IPs (hence its hardcoded `pixeldrain.*` + `video-downloads.googleusercontent.com` overrides) but **cannot** defeat IP-level blocks (bcdn / cf.streamflixserver.site / 4khdhub.mx scraper egress) or non-playable segment formats.

---

## 7. Request flow — the fixed ad-free/direct path (end to end)

1. User opens `https://cinecub.stream` and a movie page.
2. Clicks the **Ad-Free Watch** tab (or the direct tab).
3. The browser calls `https://steamheaven.onrender.com/api/streams/movie/:id` (`RENDER_API`).
4. Render returns a JSON array of streams (e.g. 36 for Dune: Part Two), each URL already rewritten:
   - HLS sources → `.../m3u8-proxy?url=<encoded>&headers=<json>`
   - MP4/MKV file sources → `.../ts-proxy?url=<encoded>&headers=<json>`
5. `script.js` runs `prioritizeFileStreams()` → native MP4/MKV (4KHDHub) sorts **first**; auto-selects index 0 → a **working** source.
6. For a 4KHDHub MP4/MKV source the player sets `<video>` `src` to the `/ts-proxy` URL. The browser GETs `/ts-proxy`; Render fetches the real file (pixeldrain / `video-downloads.googleusercontent.com`) and streams it back with CORS → **plays**.
   - Verified: `HTTP 200`, `Content-Type: video/mkv`, `Access-Control-Allow-Origin: *`.
7. The normal **Watch** tab and the rest of the site use the **edge Worker** + iframe embeds instead.

---

## 8. Reliability model & known limits

- **Free tiers:** Render sleeps after ~15 min idle → kept awake by the edge Worker 10-min cron ping (`/api/health`). Cold start ~20s on first hit after a gap; the player shows "Waking up servers…" and auto-retries.
- **IP blocking (inherent):** `bcdn.hakunaymatata.com`, `cf.streamflixserver.site`, and `4khdhub.mx` (scraper egress) block ALL datacenter/cloud IPs (427/429/404/400) from both Cloudflare Workers and Render. **No VPS/proxy code fixes this.** Only residential IPs or iframe embed hosts (running on their own accepted IPs) bypass them.
- **File hosts (reliable):** `pixeldrain.dev`, `video-downloads.googleusercontent.com` do **not** IP-block and accept Render's IP → they are the dependable 4KHDHub path the player now defaults to.
- **HLS providers (unreliable):** VaPlayer segments are served as `text/html`; FebBox is DASH (`.m4s`, `application/octet-stream`). Neither plays through Hls.js regardless of proxying → they are pushed lower in the server list.
- **Edge vs Render 4KHDHub:** edge denies 4KHDHub (egress 1106); Render resolves it → that's why the ad-free/direct player sources from Render, not the edge.

---

## 9. Deployment quick-reference

| Layer | Dir | Deploy command | Live URL |
|---|---|---|---|
| Storefront | `frontend/next-storefront/` | `npm run deploy` | `https://cinecub.stream` |
| Edge Worker | `backend-edge/` | `npm run deploy` | `https://cinecub.sampadchakma22.workers.dev` |
| Render backend | `backend/` | push to GitHub `main` (auto-deploy) | `https://steamheaven.onrender.com` |

Git remote: `https://github.com/SamJU25/CineCub.git` (branch `main`).
