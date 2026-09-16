---
name: streamheaven-algorithms
description: Master reference for all core algorithms powering StreamHeaven, including source prioritization & scoring, adaptive server selection, gesture arbitration, token-bucket rate limiting, and multi-tier cache invalidation. Use whenever modifying stream selection, ranking, player gesture detection, rate limiting, or caching logic.
---

# StreamHeaven Algorithms Reference

This skill documents the deterministic algorithms, heuristics, and mathematical models that govern StreamHeaven's media delivery, player interactions, network traffic shaping, and caching.

---

## 1. Stream Source Prioritization & Scoring Algorithm

**File**: `frontend/storefront/public/script.js` (`AdFreePlayer.prioritizeFileStreams`)

### Objective
Ensure that index `0` of the stream array is an immediately playable, high-throughput source, preventing user-facing player freezes caused by non-playable HLS segments or dead CDNs.

### Algorithm Flow
```
Raw Streams Input
      │
      ▼
[Stage 1: Upstream Extraction] ──► Decodes base64 'd=' parameter or extracts 'url=' parameter
      │
      ▼
[Stage 2: Blacklist Filtering] ──► Discards known dead hosts (_deadHosts: cf.streamflixserver.site, etc.)
      │
      ▼
[Stage 3: Multi-Tier Categorization]
      ├─► Tier 1 (Verified File Hosts): pixeldrain, googleusercontent (fastest, high reliability)
      ├─► Tier 2 (Other Direct Files): Native MP4, MKV, WebM, /ts-proxy? chunks
      └─► Tier 3 (HLS Manifests): VaPlayer, FebBox, Videasy (.m3u8)
      │
      ▼
Sorted Stream Output: Tier 1 ──► Tier 2 ──► Tier 3
```

### Complexity
- **Time Complexity**: O(N * M) where N is the number of stream candidates (typically 3–15) and M is the number of blacklisted hosts. Since N, M <= 20, execution latency is < 1ms.
- **Space Complexity**: O(N) for partitioned buckets.

---

## 2. Hybrid Fast Server Latency & Quality Selection Algorithm

**File**: `frontend/storefront/public/script.js` (`findFastestWorking`)

### Objective
Probe the top candidates from the prioritization stage using lightweight HTTP byte-range pings to find the fastest responsive high-quality stream without draining server memory.

### Mathematical Quality Scoring
Streams are assigned a numerical resolution rank Q(s):
- 4K / 2160p: 2160
- 1440p: 1440
- 1080p: 1080
- 720p: 720
- 480p: 480
- Default: 0

### Probe Mechanics
1. **Candidate Pool Bounding**: Restrict probing to top K = 3 sorted streams (`_TOP_CANDIDATES_LIMIT = 3`).
2. **Sub-chunk Range Ping**: Outbound GET with header `Range: bytes=0-0` and strict timeout `_LATENCY_TIMEOUT_MS = 1800ms`.
3. **Scoring Function**:
   A candidate A beats candidate B if:
   - A responds with HTTP 200 or 206 within the timeout, AND
   - Q(A) > Q(B), OR (Q(A) == Q(B) and Latency(A) < Latency(B)).

---

## 3. Double-Tap Spatial-Temporal Gesture Arbitration Algorithm

**File**: `frontend/storefront/public/script.js` (`StreamGestures.bind`)

### Objective
Differentiate between:
1. **Double-tap seek backward** (-10s)
2. **Double-tap seek forward** (+10s)
3. **Single-tap play/pause** toggle
4. Native mobile fullscreen/zoom and synthetic mouse clicks.

### Spatial Partitioning
The video bounding box width W is partitioned along the X-axis:
- Left: x < 0.40 * W (Seek -10s)
- Center: 0.40 * W <= x <= 0.60 * W (Play/Pause)
- Right: x > 0.60 * W (Seek +10s)

### Temporal Windowing & Event Deduplication
1. **Action Throttle**: Discard events where delta_t_action = t_now - t_lastAction < 60ms.
2. **Double-Tap Window**: If Zone(x) in {Left, Right} and t_now - t_lastTap < 350ms on the same side:
   - Cancel pending single-tap timers.
   - Execute seek delta_s = +/-10s.
   - Trigger GPU-accelerated HUD indicator.
3. **Center Single-Tap Debounce**: If Zone(x) == Center, set a timer for 280ms. If no second tap arrives within 280ms, toggle video playback.
4. **Touch vs Synthetic Click Guard**: On touch devices, `touchend` records t_touch = t_now. Any synthetic `click` event with t_click - t_touch < 450ms is dropped to eliminate double-firing.

---

## 4. Token-Bucket Rate Limiter with Lazy Garbage Collection

**File**: `backend/internal/ratelimit/ratelimit.go`

### Mathematical Model
Each client IP has a bucket with capacity B (burst) and token refill rate R (tokens/sec).

Upon arrival of a request at time t:
1. Calculate elapsed time delta_t = t - t_last.
2. Calculate new token count:
   tokens_new = min(B, tokens_current + delta_t * R)
3. If tokens_new >= 1:
   - Consume 1 token: tokens_current = tokens_new - 1.
   - Allow request.
4. Else:
   - Reject request with HTTP 429 Too Many Requests.

### Memory Management (Lazy GC)
Instead of running a background goroutine with a periodic ticker (which risks memory leaks and lock contention):
- `lastGC` timestamp is tracked.
- When t_now - t_lastGC > 5 minutes, prune all IP buckets that have been inactive for > 10 minutes.

---

## 5. Multi-Tiered Hierarchical Caching Algorithm

StreamHeaven utilizes a 4-tier hierarchical cache to minimize origin latency and eliminate duplicate upstream requests:

| Tier | Storage Medium | Key | TTL | Strategy |
|---|---|---|---|---|
| **L1 (Client RAM)** | `Map<string, Promise>` | Normalized URL | Session lifetime | Request Deduplication (coalesces parallel requests to 1 network flight) |
| **L2 (Client Disk)** | `sessionStorage` | `tmdb_${url}` | Browser tab session | Fast page back/forward navigation without network |
| **L3 (Edge Worker)** | Cloudflare KV (`STREAMS`) | `stream:${type}:${id}:${s}:${e}` | 3600s (Movie) / 900s (TV) | Global edge cache; bypasses Render backend entirely |
| **L4 (Origin)** | Go In-Memory Cache | TMDB ID & Provider | 600s | Upstream provider shielding |

---

## 6. Cold-Start Keep-Alive & Adaptive Fallback Algorithm

**Files**: `backend-edge/src/index.ts`, Cloudflare Workers Cron

### Keep-Alive Heartbeat
- Free-tier Render instances enter sleep state after 15 minutes of idle time.
- Cloudflare scheduled cron (`*/10 * * * *`) executes a lightweight HEAD request to `https://steamheaven.onrender.com/api/health`.
- Keeps the Go container alive indefinitely without incurring paid compute costs.

### Adaptive Fallback
- When a user requests streams for cold content, the Edge Worker races the Render backend with an expanded 25-second timeout (`AbortSignal.timeout(25000)`).
- If Render is waking up, the Edge Worker waits up to 25s, saves the resolved streams into KV, and serves subsequent requests in < 20ms.
