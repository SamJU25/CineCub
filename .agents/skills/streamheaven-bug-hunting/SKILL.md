---
name: streamheaven-bug-hunting
description: Systematic bug finding, root cause analysis (RCA), and automated error diagnostics across StreamHeaven (Storefront vanilla JS/Svelte, Cloudflare Edge Worker, and Render Node streaming proxy). Use whenever debugging unexplained UI blanks, player freezes, TMDB API 500/502 errors, rate limiter crashes, unhandled exceptions in script.js, or memory/cold-start issues.
---

# StreamHeaven Bug Hunting & Root-Cause Analysis

A specialized debugging and error-resolution runbook adapted from `everything-claude-code` and optimized specifically for StreamHeaven's 3-tier architecture.

---

## The 5-Step Bug Hunting Protocol

Whenever a bug, blank screen, player stall, or server error is reported, **NEVER GUESS**. Follow this deterministic loop:

```
1. REPRODUCE      ──► Replicate failure deterministically (JSDOM / Python probe / curl)
2. ISOLATE        ──► Trace call stack to the exact offending line & root trigger
3. MINIMAL DIFF   ──► Craft the smallest surgical fix (no unsolicited refactoring)
4. VERIFY GATES   ──► Test reproduction + run build + test live deployment
5. SELF-ANNEAL    ──► Record failure mode in directive/skill to prevent recurrence
```

---

## StreamHeaven Common Bug Taxonomies

### Category 1: Client Script Runtime Exceptions (`frontend/storefront/public/script.js`)

| Bug Signature | Common Root Cause | StreamHeaven Solution |
|---|---|---|
| `TypeError: X is not a function` | An object method (e.g. `Prog.init()`) is invoked but never declared on the object. | Add the method to the object definition or guard with `if (typeof X === 'function')`. |
| `Cannot read properties of null (reading 'innerHTML'/'classList')` | Element selector (`document.getElementById(...)`) returned `null` because the ID is missing or misspelled in `index.html`. | Check element exists first: `var el = document.getElementById(...); if (!el) return;`. |
| Blank Homepage / Rows Not Loading | 1. `DOMContentLoaded` listener registered after DOM is already `complete` / `interactive`.<br>2. Monolithic `Promise.all` aborted by a single failing endpoint.<br>3. Uncaught error in an early init function halts entire JS execution. | 1. Use `if (document.readyState === 'loading') { addEventListener(...) } else { initApp(); }`.<br>2. Decouple into independent promises with `Promise.allSettled`.<br>3. Run `node .agents/skills/streamheaven-bug-hunting/scripts/audit_client_code.js`. |
| Horizontal Scroll Duplicate Items | `HScrollLoad` initial page counter set to `2` when page 1 & 2 were already fetched at page load. | Initialize `page: 3` for pre-loaded rows. |
| Stale Script Served to User | Browser / Service Worker (`sw.js`) caching previous `script.js`. | Bump version query in `index.html` (`script.js?v=XXX`) and update `CACHE_NAME` (`streamheaven-vXXX`) in `sw.js`. |

---

### Category 2: Edge Worker & Cloudflare Serverless (`backend-edge/`, `storefront/src/pages/api/`)

| Bug Signature | Common Root Cause | StreamHeaven Solution |
|---|---|---|
| `Cannot read properties of undefined (reading 'count')` | Local variable inside rate limiter / token bucket not reassigned when inserting a new IP entry. | Ensure `let bucket = BUCKETS.get(ip); if (!bucket) { bucket = {...}; BUCKETS.set(ip, bucket); }`. |
| HTTP 500 on Cloudflare Cache API | 1. `new Request(cacheUrl, request)` passes invalid or internal client headers.<br>2. `cache.match()` or `cache.put()` throws unhandled rejection. | 1. Always use `new Request(cacheUrl, { method: 'GET' })`.<br>2. Wrap Cache API calls in `try/catch` and add `.catch()` to `waitUntil()`. |
| Locked / Missing CORS on Cached Response | Cloudflare Cache API stores responses with immutable headers, stripping incoming dynamic origins (`streamheaven.online` vs `www.streamheaven.online`). | Clone response headers into `new Headers(res.headers)`, re-set `Access-Control-Allow-Origin`, and return a new `Response(res.body, { headers })`. |
| HTTP 1106 / 403 / 427 Egress Block | Cloudflare Worker egress IP is blocked by external CDN (e.g. 4KHDHub). | Route playback scrapers through Render residential IP (`DIRECT_FROM_RENDER = true`). |

---

### Category 3: Node.js Backend & Media Proxy (`backend/`)

| Bug Signature | Common Root Cause | StreamHeaven Solution |
|---|---|---|
| Render Service Restart / OOM (512MB limit) | Unbounded memory cache or prefetching whole HLS playlists. | Enforce strict LRU caps (`max: 200`), eliminate eager playlist prefetching, and avoid buffering large binary streams in RAM. |
| Socket Hang-up on Player Close | Client navigated away or closed modal, but Node proxy kept streaming from origin. | Attach `req.once('close', () => resp.body.destroy())` to immediately terminate upstream requests. |
| 503 / 504 on Ad-Free Streams | Render free-tier sleeping after 15 minutes of inactivity. | Edge Worker cron ping keeps Render awake every 10 min. Client calls `AdFreePlayer.warmUpBackend()` on page load. |

---

## Automated Bug Auditing Tools

This skill includes an automated static & headless analyzer to detect client-side runtime bugs before deploying:

```bash
node .agents/skills/streamheaven-bug-hunting/scripts/audit_client_code.js
```

What the audit verifies:
1. **JavaScript Syntax**: Runs AST compilation on `public/script.js` and all inline scripts in `index.html`.
2. **DOM ID Integrity**: Extracts all `document.getElementById('xyz')` calls in `script.js` and verifies that `#xyz` exists in `index.html` (or is handled defensively with null checks).
3. **Object Initialization Integrity**: Verifies that every `Module.init()` called in the startup sequence actually exists as a function.
4. **JSDOM Headless Simulation**: Evaluates the complete codebase inside a headless browser DOM to catch unhandled `TypeError`s, `ReferenceError`s, or startup crashes.

---

## Minimal Diff Rules (from everything-claude-code)

When applying a fix:
- **Change only what is broken**: Fix the specific error without restructuring adjacent code.
- **Never perform stylistic rewrites**: Do not convert `var` to `let`/`const` or rewrite promises into `async/await` across the file unless requested.
- **Preserve interfaces and comments**: Existing comments contain architectural rationale (e.g., Render keep-alive, egress block workarounds). Keep them intact.
- **Test the diff immediately**:
  ```bash
  # 1. Run local audit
  node .agents/skills/streamheaven-bug-hunting/scripts/audit_client_code.js

  # 2. Verify storefront build
  cd frontend/storefront && npm run build
  ```
