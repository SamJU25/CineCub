---
name: code-optimizer
description: Analyze, profile, refactor, and optimize code performance, memory usage, bundle size, latency, and runtime efficiency across StreamHeaven's full stack (Go backend proxy, Cloudflare Edge Worker, Astro/Svelte/Vanilla JS storefront, and Android Kotlin WebView). Make sure to use this skill whenever the user asks to optimize code, improve speed or loading times, reduce CPU/memory consumption, eliminate memory leaks, streamline scrapers, minify assets, benchmark endpoints, or profile any layer of StreamHeaven.
---

# Code Optimizer Skill (StreamHeaven Full-Stack)

Comprehensive guidelines, battle-tested patterns, and verification procedures for maximizing speed, minimizing resource usage, and eliminating bottlenecks across all four tiers of the StreamHeaven platform.

---

## 1. Operating Methodology

Always follow the **Measure $\rightarrow$ Identify $\rightarrow$ Optimize $\rightarrow$ Verify** loop:

```
[Profile / Measure] ──► [Pinpoint Bottleneck] ──► [Targeted Refactor] ──► [Verify & Benchmark]
        ▲                                                                        │
        └─────────────────────────── Self-Anneal ────────────────────────────────┘
```

1. **Never optimize blindly**: Identify whether the bottleneck is I/O-bound (network latency, scraper cold-starts, slow third-party CDNs), CPU-bound (DOM repaints, regex backtracking, JSON parsing), or Memory-bound (unclosed streams, event listener leaks, lingering video buffers).
2. **Preserve functionality & contracts**: An optimization that introduces a regression or breaks API schemas is a failure. Always verify behavior before and after.
3. **Keep code readable**: Avoid convoluted micro-optimizations that save nanoseconds at the cost of maintainability unless in critical hot loops (e.g. streaming proxy chunk relay).

---

## 2. Frontend Storefront Optimization (`frontend/storefront/`)

### A. JavaScript Performance (`public/script.js` & Svelte components)
- **DOM Access Caching**:
  - ❌ Avoid repeated `document.getElementById()` inside `timeupdate`, `scroll`, or `mousemove` handlers.
  - ✅ Cache references once during component/view initialization (`initApp`, `Player.init`).
- **Event Listener & Gesture Hygiene**:
  - Always clean up event listeners, intervals, and observers when swapping views, closing modals, or destroying players (`Hls.destroy()`, `clearInterval(checkWakeup)`).
  - Use `{ passive: true }` on touch and scroll listeners where `preventDefault` is not needed.
  - For gesture detection (like `StreamGestures`), use physical isolation overlays (`.player-gesture-overlay`) with `touch-action: manipulation` to prevent browser compositor hit-test overhead.
- **Debouncing & Throttling**:
  - Throttle search inputs (`Search.onInput`, 250ms debounce) to avoid flooding the TMDB proxy.
  - Debounce player center taps (`280ms`) to isolate single taps from rapid double-tap seek gestures.
- **Memory Leak Elimination**:
  - On modal close or server switch, reset video sources:
    ```javascript
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    ```
  - Disconnect `MutationObserver` and `ResizeObserver` instances when detached from the DOM.

### B. CSS & Rendering Performance (`public/style.css`)
- **Hardware Acceleration**:
  - Force GPU compositing on animated overlays and seek indicators:
    ```css
    transform: translateZ(0);
    will-change: transform, opacity;
    backface-visibility: hidden;
    ```
  - Remove `will-change` once animations finish or limit its usage strictly to dynamic elements to avoid GPU VRAM exhaustion.
- **Avoid Layout Thrashing**:
  - Never interleave style writes (`element.style.width = ...`) with layout reads (`element.offsetHeight`, `getBoundingClientRect()`). Batch all reads first, then perform writes in `requestAnimationFrame()`.
- **Media Queries & Content Visibility**:
  - Utilize `content-visibility: auto;` and `contain-intrinsic-size` on long lists (e.g., episode lists, search results, genre grids) to skip offscreen layout calculations.

---

## 3. Cloudflare Edge Worker Optimization (`backend-edge/`)

### A. CPU Time & Latency Budget
Cloudflare Workers enforce strict CPU execution budgets (10ms on free, 50ms on paid):
- **Concurrent Scraping with Timeouts**:
  - Use `Promise.allSettled()` with strict per-provider `AbortController` timeouts (e.g. 2500ms).
  - Never let a dead scraper stall the entire aggregation pipeline.
- **Subrequest Optimization**:
  - Cache static scraper metadata and resolved stream URLs in Cloudflare KV (`STREAMS` namespace) with appropriate TTLs (e.g., 3600s for movies, 900s for recent TV).
  - Use Cloudflare Cache API for edge-caching TMDB JSON responses:
    ```typescript
    const cache = caches.default;
    let response = await cache.match(request);
    if (!response) {
      response = await fetch(originUrl);
      ctx.waitUntil(cache.put(request, response.clone()));
    }
    ```
- **Streaming Pipeline**:
  - Stream payloads directly using `TransformStream` instead of buffering complete responses into memory (`await response.text()` or `await response.arrayBuffer()`).

---

## 4. Go Backend Streaming Proxy (`backend/`)

### A. High-Throughput Chunk Proxying (`/m3u8-proxy`, `/ts-proxy`)
- **Zero-Copy Buffer Streaming**:
  - Use `io.Copy` or `io.CopyBuffer` with a reused slice from `sync.Pool` rather than reading entire chunks into memory slices.
- **HTTP Transport Pooling**:
  - Reuse a globally configured `http.Client` with tuned connection pools:
    ```go
    var httpClient = &http.Client{
        Transport: &http.Transport{
            MaxIdleConns:        500,
            MaxIdleConnsPerHost: 100,
            IdleConnTimeout:     90 * time.Second,
            DisableCompression:  true, // Avoid gzip overhead on video chunks
        },
        Timeout: 30 * time.Second,
    }
    ```
- **Goroutine & Context Safety**:
  - Always pass `r.Context()` to outbound HTTP requests so that when a client scrubs or disconnects, the upstream proxy fetch is immediately cancelled:
    ```go
    req, err := http.NewRequestWithContext(r.Context(), "GET", targetURL, nil)
    ```

---

## 5. Android WebView & Native App (`frontend/android-app/`)

### A. WebView Lifecycle & Memory Efficiency
- **Hardware Layering**:
  - Set `webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)` for 60fps video rendering.
- **Lifecycle Cleanups**:
  - Pause timers and WebGL in `onPause()`, resume in `onResume()`:
    ```kotlin
    override fun onPause() {
        super.onPause()
        webView.onPause()
    }
    override fun onResume() {
        super.onResume()
        webView.onResume()
    }
    ```
  - In `onDestroy()`, detach from parent view, call `webView.stopLoading()`, remove callbacks, and call `webView.destroy()` to prevent Activity memory leaks.
- **Power & Screen Lock Management**:
  - Only hold `FLAG_KEEP_SCREEN_ON` during active fullscreen playback (`onShowCustomView`). Release it immediately on `onHideCustomView`.

---

## 6. Verification & Quality Gates

Before concluding any optimization task, execute the verification loop:
1. **Type & Syntax Checking**:
   - Storefront / Edge: `npm run build`
   - Backend Go: `go vet ./...` and `go test ./...`
   - Android App: `./gradlew assembleDebug` (if Android SDK present)
2. **Performance Verification**:
   - Check bundle sizes (ensure no accidental vendor bloat).
   - Test responsive layout and gesture responsiveness across viewport breakpoints.
   - Probe live endpoints with `curl -s -w "time_total: %{time_total}s\n"` to verify latency reduction.
