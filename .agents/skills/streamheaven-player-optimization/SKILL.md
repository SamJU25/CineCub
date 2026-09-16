---
name: streamheaven-player-optimization
description: Optimize, debug, refactor, and maintain the client-side streaming player in frontend/storefront/public/script.js, Svelte components, and the native video/HLS playback pipeline. Make sure to use this skill whenever modifying video playback logic, adjusting source sorting and prioritization (prioritizeFileStreams), configuring Hls.js or HTML5 <video> options, debugging Android WebView video playback, updating player UI controls, or tuning cold-start retry flows.
---

# StreamHeaven Player Optimization

Guidelines and best practices for developing and maintaining the client-side player system in `frontend/storefront/public/script.js` (~3800 lines) and corresponding Astro/Svelte components.

## Architecture of the Dual-Playback System

StreamHeaven storefront supports two distinct playback modes:

1. **Regular "Watch" Tab (Embed Player)**
   - Uses third-party iframe embed providers (e.g. Vidlink, Vidsrc, Superembed).
   - Self-hosted iframe sandbox, ad-blocker guidance, and multi-server selector.
   - Sourced via Cloudflare Edge Worker API.

2. **"Ad-Free Watch" / Direct Native Player**
   - **No iframes**: Directly mounts native `<video>` (MP4/MKV) or attaches `Hls.js` (HLS m3u8).
   - Provides true native playback with custom controls, picture-in-picture, native keyboard shortcuts, and zero embedded popups.
   - Sourced directly from the Render proxy backend (`DIRECT_FROM_RENDER = true`).

## Key Constants and Sourcing Flow in `public/script.js`

```javascript
const RENDER_API = 'https://steamheaven.onrender.com';
const DIRECT_FROM_RENDER = true;
```

When the user opens a title in the Ad-Free player:
1. `fetchDirectStreams(type, id, season, episode)` calls `RENDER_API + '/api/streams/' + type + '/' + id`.
2. The returned stream array is run through `prioritizeFileStreams(streams)`.
3. The player selects index 0 by default.

## Rules for `prioritizeFileStreams()`

Native file-host streams (MP4/MKV via `/ts-proxy`) are vastly more reliable on mobile, smart TVs, and desktop browsers than scraped HLS streams. 

When modifying stream sorting:
- **Rule 1**: Keep MP4/MKV sources (especially 4KHDHub pixeldrain and googleusercontent relays) at the top of the list.
- **Rule 2**: Detect file streams by checking for `/ts-proxy` or file extensions `.mp4`, `.mkv`, `.webm`, `.mov`.
- **Rule 3**: Tag streams with clear visual badges in the server picker (e.g. `[Direct HD]`, `[4K File]`, `[HLS]`).
- **Rule 4**: Demote HLS providers that produce non-standard segment mime types (e.g. text/html, m4s DASH fragments) to the bottom.

## Handling Render Cold Starts ("Waking up servers...")

Render free tier instances sleep after 15 minutes of idle time. The client player must gracefully manage this:
1. When initiating stream fetch, set a 6-second timeout before displaying a friendly status notice: `"Waking up servers... this takes ~20s on first load"`.
2. Implement exponential backoff retry (attempt 1 at 5s, attempt 2 at 12s, attempt 3 at 20s).
3. Do NOT display an error toast or redirect the user until all retry attempts are exhausted.

## Android App & WebView Considerations

The native Android wrapper (`frontend/android-app/`) loads the storefront inside an Android `WebView`:
- **Hardware Acceleration**: `<video>` tags require `android:hardwareAccelerated="true"` in AndroidManifest (already configured).
- **Fullscreen Handling**: Ensure `webkitRequestFullscreen` and standard `requestFullscreen` fallbacks are preserved for full-screen toggle.
- **Mixed Content**: Never serve HTTP media URLs inside the HTTPS storefront. All streams must be HTTPS proxied through `/ts-proxy` or `/m3u8-proxy`.
- **Media Controls**: Keep native touch targets at least 48x48px for scrubbing, play/pause, and source selection.

## Editing Checklist for `public/script.js`

Before saving changes to `public/script.js`:
- [ ] Preserve existing event listeners for keyboard shortcuts (Space, Arrow keys, F for fullscreen, M for mute).
- [ ] Verify `localStorage` progress tracking key format (`streamheaven_progress_${id}`).
- [ ] Ensure `Hls.destroy()` is called before swapping video sources to prevent memory leaks.
- [ ] Verify both movie (`/movie/:id`) and series (`/series/:id?season=&episode=`) signatures remain intact.
- [ ] Test in both desktop browser and mobile viewport emulator.
