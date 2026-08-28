# StreamHeaven — Base44 Dev Notes

## What this is
A static Vanilla JS/HTML/CSS movie/TV streaming PWA deployed to Cloudflare Pages. The only server-side piece is a Pages Function that proxies `/api/tmdb/*` → `https://api.themoviedb.org/3/*`, injecting `TMDB_API_KEY` server-side so it never reaches the browser.

## How it runs here
- `docker-compose.base44.yml` runs a single `node:22` service that installs `wrangler` and runs `wrangler pages dev . --port 8788 --ip 0.0.0.0`.
- `wrangler pages dev` serves the static assets from the repo root AND the Pages Function at `functions/api/tmdb/[[path]].js` (catch-all route). Host port 3000 → container 8788.
- It reads `TMDB_API_KEY` from `.dev.vars` (committed in the repo). No external secrets are required to boot.

## External dependencies (not required to boot)
- Firebase Auth: config is hardcoded in `firebase-auth.js` (public client config). Used for optional profile/watchlist sync; the app loads fine without it.
- Streaming sources: third-party embed URLs (vidlink, vidsrc, autoembed, etc.) and `https://streamheaven-api.onrender.com` — only used when actually playing a video, not at load.

## Verify it works
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` → 200
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/api/tmdb/trending/all/week?page=1` → JSON from TMDB
- Preview should show the StreamHeaven home page with movie carousels populated.

## Editing
- Frontend edits (HTML/CSS/JS) are served live from the bind mount — `wrangler pages dev` picks up changes on refresh.
- Function edits (`functions/`) also reload. If a change doesn't appear, call `reload_preview`.
