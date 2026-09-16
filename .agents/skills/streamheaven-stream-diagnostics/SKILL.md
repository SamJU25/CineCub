---
name: streamheaven-stream-diagnostics
description: Diagnose, test, benchmark, and debug streaming sources, scrapers, and media proxy endpoints for StreamHeaven. Make sure to use this skill whenever investigating why a movie or TV stream fails to play, debugging scraper errors (Vidlink, VaPlayer, 4KHDHub, Streamflix, FebBox, Netmirror), analyzing HTTP 1106 Cloudflare egress blocks, verifying CORS or Range request headers, or validating /m3u8-proxy and /ts-proxy endpoints.
---

# StreamHeaven Stream Diagnostics

A diagnostic runbook for isolating, inspecting, and repairing stream resolution and media playback issues across StreamHeaven's dual-backend architecture.

## System Overview & Request Routing

StreamHeaven uses two independent stream-resolution engines:
1. **Render Proxy Backend** (`https://steamheaven.onrender.com`): Resolves streams using a residential-tolerant server IP and proxies media through `/ts-proxy` (MP4/MKV) and `/m3u8-proxy` (HLS). Sourced by the **Ad-Free Watch** / direct native player.
2. **Cloudflare Edge Worker** (`https://streamheaven-edge.sampadchakma22.workers.dev`): Aggregates streams for the default **Watch** tab (iframe embeds) and provides KV caching.

## Diagnostic Decision Tree

When a title fails to play or streams return empty, follow this triage flow:

```
Stream Failure Reported
  │
  ├─► Check Render Health: GET https://steamheaven.onrender.com/api/health
  │     └─► If > 5s or 503/timeout: Server is waking from cold sleep (Render free tier).
  │
  ├─► Test Title Endpoint: GET /api/streams/:type/:tmdbId
  │     ├─► HTTP 200 with empty []:
  │     │     └─► Scraper failure or IP egress block (e.g. 4khdhub.mx blocking CF Worker 1106).
  │     └─► HTTP 200 with streams:
  │           └─► Inspect stream types & URL rewriting.
  │
  └─► Validate Playback Stream:
        ├─► /ts-proxy?url=... -> Check HTTP 200/206, Content-Type, CORS (*).
        └─► /m3u8-proxy?url=... -> Check segment MIME types (reject text/html or .m4s DASH).
```

## Running the Automated Diagnostic Script

Run the bundled diagnostic tool in deterministic mode:

```bash
python .agents/skills/streamheaven-stream-diagnostics/scripts/test_streams.py --type movie --id 693134
```

For TV shows:
```bash
python .agents/skills/streamheaven-stream-diagnostics/scripts/test_streams.py --type series --id 1399 --season 1 --episode 1
```

Options:
- `--target render` (default) or `--target edge`
- `--local` to target `http://localhost:3000` or `http://localhost:8787`
- `--check-media` to probe the first 3 media files with HEAD/Range requests

## Known Failure Modes & How to Address Them

### 1. Cloudflare Egress Block (HTTP 1106 / 403 / 427)
- **Symptom**: `backend-edge` 4KHDHub scraper returns `[]` while Render returns working streams.
- **Cause**: Cloudflare Worker datacenter IP ranges are hard-blocked by certain upstream scraper CDNs (`4khdhub.mx`, `bcdn.hakunaymatata.com`, `cf.streamflixserver.site`).
- **Resolution**: Do NOT attempt to rewrite scraper logic on the Edge Worker to bypass CDN egress blocking; datacenter egress blocks cannot be solved at the worker code level. Instead, route direct stream resolution through the Render backend (`DIRECT_FROM_RENDER = true` in `public/script.js`).

### 2. File Host Range & Header Clamping
- **Symptom**: Native player buffers endlessly or fails seeking on MP4/MKV sources.
- **Cause**: Upstream file host requires specific `Referer` or does not support standard HTTP 206 Partial Content.
- **Resolution**: Verify that the URL is piped through `/ts-proxy`. Inspect `backend/proxy/proxyServer.js` to ensure the Range request headers are clamped and forwarded:
  ```javascript
  const rangeHeader = req.headers.range;
  // Verify 206 response and Accept-Ranges: bytes
  ```

### 3. HLS Variant / Segment Content-Type Mismatch
- **Symptom**: Hls.js throws `bufferAddCodecError` or `manifestLoadError`.
- **Cause**: Providers like VaPlayer serve segment chunks with `Content-Type: text/html`, or FebBox delivers DASH fragments (`.m4s`).
- **Resolution**:
  - Check `prioritizeFileStreams()` in `public/script.js` to make sure native MP4/MKV file sources (4KHDHub pixeldrain / googleusercontent) sort before unverified HLS sources.
  - In `backend/proxy/proxyServer.js`, confirm `/m3u8-proxy` replaces all segment URLs with proxied paths so the browser never touches the origin CDN directly.

### 4. Cold Start Latency
- **Symptom**: Request takes 20-30s on first load after inactivity.
- **Cause**: Render free tier spindown after 15 minutes of idle.
- **Resolution**: Confirm the edge cron in `backend-edge/wrangler.toml` is active:
  - Cron trigger `*/10 * * * *` triggers `pingRenderKeepAlive()`.
  - Frontend displays "Waking up servers..." toast with auto-retry.
