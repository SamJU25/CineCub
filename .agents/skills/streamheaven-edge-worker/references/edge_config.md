# Cloudflare Edge Worker Configuration Reference

## Wrangler Settings & Variables

Below is the configuration matrix from `backend-edge/wrangler.toml`:

| Variable | Current Value | Description |
|---|---|---|
| `ENABLE_PROXY` | `"false"` | Direct mode by default; when false, `/proxy` route returns 403 to prevent bandwidth abuse |
| `DEFAULT_PROVIDERS` | `vidlink,vixsrc,videasy,streamflix,dahmermovies,castletv,zxcstreams,netmirror,vaplayer,onetouchtv,hdghartv` | Scrapers invoked during edge stream aggregation |
| `DIRECT_PROVIDERS` | `vidlink,vaplayer` | Providers flagged with `playable: true` on the edge |
| `STREAM_CACHE_TTL_SECONDS` | `180` | KV cache TTL in seconds for aggregated stream results |
| `POPULAR_WARM_LIMIT` | `50` | Number of popular TMDB titles scraped by the 6-hour cron |
| `RENDER_BASE_URL` | `https://steamheaven.onrender.com` | Ping target for the keep-alive cron job |

## Storage & Queue Bindings

- **KV Namespace**: `STREAMS` (`id: 8ef1ce1a9b1c43f7ab188c03ba8eeff6`) — Stores stream payloads keyed by `movie:{tmdbId}` or `series:{tmdbId}:{s}:{e}`.
- **R2 Bucket**: `MEDIA_CACHE` (`bucket_name: streamheaven-cache`) — Optional binary media cache for proxy streams.
- **Queues**: `WARM_QUEUE` (`queue_name: warm-streams`) with dead-letter queue `warm-streams-dlq`.

## Edge Logging & Verification

To tail live edge worker logs:
```bash
cd backend-edge && npx wrangler tail
```
