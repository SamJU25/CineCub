# StreamHeaven — Base44 Dev Notes

## What this is
A Cloudflare Pages app: static frontend (`index.html`, `script.js`, `style.css`, `sw.js`, `manifest.json`) plus a single Pages Function at `functions/api/tmdb/[[path]].js` that proxies requests to the TMDB API and injects the `TMDB_API_KEY` server-side so it is never exposed to the browser.

## How it runs here
- `docker-compose.base44.yml` runs a `node:22` container with the repo bind-mounted at `/app`.
- It installs `wrangler` (pinned to v3 in `package.json`) and runs `wrangler pages dev . --ip 0.0.0.0 --port 3000`.
- `wrangler pages dev` serves the static files AND the Pages Function on one origin (port 3000), and reads `.dev.vars` for the `TMDB_API_KEY` binding. The key is already committed in `.dev.vars`.
- The frontend calls `/api/tmdb/*` (same origin), so no CORS/separate-origin wiring is needed.

## Secrets
- `TMDB_API_KEY` — already present in the committed `.dev.vars`. Required for the proxy to return data; without it the function returns a 500 "TMDB API key not configured".
- The streaming player calls an external hosted API at `https://streamheaven-api.onrender.com/api/streams/...` (see `script.js` ~line 1261). This is the author's deployed backend, not part of this repo; it is only hit when a user presses play, so it does not affect boot.

## Verify it works
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` → returns `index.html` (200).
- `curl -sf "http://localhost:3000/api/tmdb/trending/all/week?page=1"` → returns TMDB JSON.
- `docker compose -f docker-compose.base44.yml logs web` should end with `Ready on http://0.0.0.0:3000`.

## Notes / quirks
- No build step. Static files are served fresh on each request; editing `index.html`/`script.js`/`style.css` shows on browser reload. The Pages Function recompiles automatically when `functions/` changes (wrangler watch).
- `node_modules` is kept in a named volume so `npm install` isn't re-run from scratch every restart (the compose command still re-runs it idempotently).
- wrangler warns about an outdated version / missing `compatibility_date`; these are non-fatal and the runtime falls back to a supported compatibility date.
