# CineCub Security Audit & Remediation

Audit date: 2026-09-02
Scope: `CineCub-API` (backend), `storefront` (Cloudflare Workers SSR + app shell), `android-app` (WebView wrapper).

## Findings and fixes

### Backend (CineCub-API)

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | Default admin password `change-me` committed to repo (`utils/auth-users.json`), hash known-bad | Critical | On startup, any hash verifying as `change-me` is rotated to a random password (`rotateDefaultCredentialsIfNeeded`); new installs generate a random password (`ensureAuthFile`) or read `ADMIN_PASSWORD` env. Config files untracked + gitignored. |
| 2 | Path traversal via `tmdbId`/path into Showbox file cache (`path.join` with `../...`) | High | `tmdbId`/season/episode validated (`/^(\d+\|tt\d+)$/i`, positive ints) in `apiServer.js`; cache keys sanitized inside `getFromCache`/`saveToCache` (Showbox). |
| 3 | SSRF through generic proxy once `enableProxy` is on | High | `proxy/proxyServer.js`: `safeFetch` with scheme allow-list, private-IP/link-local/metadata-IP blocking, DNS re-resolution (`resolveHostSafe`), `redirect: "manual"` with per-hop validation, header sanitization, generic error responses. |
| 4 | Rate limiting bypass via spoofed `X-Forwarded-For` | Medium | `getClientIp` uses `cf-connecting-ip` → `x-real-ip` → socket remoteAddress; rate-limit maps pruned on TTL. |
| 5 | Admin session cookie missing `Secure` flag | Medium | `Secure` applied when request is HTTPS. Sessions compared in constant time (`safeEqual`). |
| 6 | Password-reset email HTML-injection via user email | Medium | `escapeHtml()` applied to email (`utils/mailer.js`). |
| 7 | Admin panel XSS via `innerHTML` interpolation of keys/cookies | Medium | `setFebboxCookies`/`setTmdbKeys` rebuilt with `createElement`/`textContent`. |
| 8 | 4khdhub provider substring host matching + any-scheme URLs | Low | Exact/suffix host match, http/https only, private-hostname rejection. |
| 9 | Secrets in images (`serviceAccountKey.json`) | Low | Added to `.dockerignore`. |

### Storefront (Cloudflare Worker)

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 10 | TMDB proxy cache-bypass via unique query params (`&_=1` e.g.) → API-spam | Medium | Canonical cache key (noise params stripped, params sorted); per-IP fixed-window rate limit (60/10s); strict path allowlist. |
| 11 | Missing HSTS / `frame-ancestors` / CSP on SSR HTML | Medium | `src/middleware.ts`: HSTS, `X-Frame-Options`, CSP, `Referrer-Policy`, `Permissions-Policy` (CSP skipped on app-shell root where the app meta CSP applies). |
| 12 | App-shell CSP permissive: `frame-src *`, `connect-src *`, `media-src *`, unpinned `hls.js@latest` | Medium | Meta CSP tightened: `frame-src https:`, `connect-src 'self' https:`, `media-src 'self' https: blob:`, added `base-uri`/`form-action`/`frame-ancestors 'none'`; hls.js pinned to `1.7.1`. |

### Android app

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 13 | User-CA trust + cleartext enabled (`network_security_config.xml`, `usesCleartextTraffic`) | High | Cleartext disabled, system CAs only; `MIXED_CONTENT_NEVER_ALLOW`. |
| 14 | JS bridge (`AndroidShare`) callable by any third-party iframe | High | Origin guard: bridge methods ignored unless top-level page is `cinecub.stream`. |
| 15 | Substring host matching in navigation router (`host.contains("cinecub.stream")`) | Medium | Exact/suffix matching (`isSuffixHost`), scheme restricted to http/https; main-frame guard also applied on legacy `shouldOverrideUrlLoading`. |
| 16 | APK updates from arbitrary URL, no integrity check | High | `apkUrl` must be https on our domain (validated twice); downloaded APK verified against `apkSha256` in `version.json` before install; cache fallback dir narrowed. |
| 17 | FileProvider exposes whole external-cache dir | Low | Only `Download` (external-files-path) and `apk-updates` (cache path) exposed. |
| 18 | `allowBackup=true`, `mediaPlaybackRequiresUserGesture=false` | Low | `allowBackup=false` (+ backup-rules xml removed), media now requires a user gesture. |
| 19 | Release APK signed with debug keystore (no `keystore.properties`) | High | Loud build-time warning added; **resolved in v1.4.0** — real release keystore created (`~/.cinecub/cinecub-release.jks`, PKCS12, RSA-4096) and `keystore.properties` wired into the build. |
| 20 | Auth lookups rate-limited, but general `/api/*` endpoints + request observability missing | Low | In v1.4.0: lightweight request logging (all routes), plus a per-IP fixed-window limiter (`600/15min`) on `/api/*` (health/metrics exempt). Login, forgot-password, and stream endpoints were already throttled. |

## Verification

- Backend: `node --check` on all edited files; default-credential rotation smoke-tested end-to-end (password rotated, `change-me` rejected).
- Storefront: `npm run build` succeeds; CSP/pin/rate-limit/HSTS confirmed present in built worker bundle.
- Android: `compileDebugKotlin` and `assembleRelease` succeed. **v1.4.0 switches to the release keystore** (cert SHA-256 `6dc7c0b3…`, verified v2 scheme).

## Manual follow-ups

- **Rotate the TMDB API key** (in the TMDB dashboard): the previous key is exposed in git history. After rotating, update the value in `frontend/next-storefront/.env.local`, `wrangler secret put TMDB_API_KEY`, and the Render service's `TMDB_API_KEY`/`TMDB_API_KEYS` env, then update the API admin panel if overrides are stored. (The key never reaches the browser — both the storefront proxy and API inject it server-side — so rotation is about revoking the historical value.)
- **Back up the release keystore**: `C:\Users\TendaSC\.cinecub\cinecub-release.jks` + its password. If lost, all future OTA updates fail signature checks. Consider moving the password into a password manager / CI secret.
- **One-time reinstall after v1.4.0**: the app signature changes from the debug cert to the release cert, so Android will not upgrade v1.3.0 → v1.4.0 in place. Existing users must uninstall + reinstall once. All future releases must keep the release keystore so OTA continuity holds from v1.4.0 onward.
- `targetSdk` stays at 34 intentionally: targetSdk 35 enforces edge-to-edge on Android 15, which would break this WebView shell's layout (`setDecorFitsSystemWindows(true)` is ignored) and this is a sideloaded app, so Play policy is not a driver.
- Repo states: API and main repos are clean and pushed after this release.

## Release v1.2.0

- `versionCode` 12 / `versionName` 1.2.0; APK published to `https://cinecub.stream/CineCub.apk?v=120`.
- `version.json` now carries `apkSha256` for client-side integrity verification.
- Remember: any future APK rebuild must bump `versionCode` and recompute `apkSha256`.

## Release v1.3.0

- `versionCode` 13 / `versionName` 1.3.0; removed the Android `SwipeRefreshLayout` (it stole scroll gestures → sluggish feel + accidental pull-to-refresh from dropdowns). Still debug-signed.

## Release v1.4.0

- `versionCode` 14 / `versionName` 1.4.0; **release-signed** (new keystore). User-Agent now reports `CineCubApp/1.4.0` via `BuildConfig.VERSION_NAME`. Web: app shell loads canonical `style.css`/`script.js` (versioned duplicate files removed; cache freshness handled by `_headers` no-cache + content-hash-free naming), SW precache updated, accessibility labels added (search inputs, menu `aria-haspopup`, `:focus-visible` rings). API: request logging + general `/api` rate limiter.
- ⚠️ Signature change vs v1.3.0 → requires a one-time manual reinstall.