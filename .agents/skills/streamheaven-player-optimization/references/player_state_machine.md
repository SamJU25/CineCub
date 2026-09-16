# StreamHeaven Player State Machine & Media Reference

## Media Types & Player Dispatching

```
Stream URL Received
  │
  ├─► Contains "/ts-proxy" or ends in .mp4, .mkv, .webm
  │     └─► Dispatch to Native <video> tag
  │           - Set video.src = url
  │           - Listen to canplay, error, waiting, timeupdate
  │           - Enable native Picture-in-Picture
  │
  ├─► Contains "/m3u8-proxy" or ends in .m3u8
  │     └─► Check HLS Support
  │           ├─► If Hls.isSupported():
  │           │     - Destroy previous hls instance
  │           │     - hls = new Hls({ maxBufferLength: 30, enableWorker: true })
  │           │     - hls.loadSource(url)
  │           │     - hls.attachMedia(video)
  │           └─► Else if video.canPlayType('application/vnd.apple.mpegurl'):
  │                 - Safari native HLS: video.src = url
  │
  └─► Third-party iframe URL (e.g. /api/embed/...)
        └─► Mount inside iframe element with sandbox permissions:
              sandbox="allow-scripts allow-same-origin allow-forms"
```

## Error Codes & Fallback Matrix

| Error Event | Condition | Recommended Handler Action |
|---|---|---|
| `MEDIA_ERR_NETWORK` | Network failure during chunk fetch | Retry `/ts-proxy` with cache-busting timestamp or fallback to next source in list |
| `MEDIA_ERR_DECODE` | Browser cannot decode codec | Auto-advance to next stream in `prioritizeFileStreams` list |
| `MEDIA_ERR_SRC_NOT_SUPPORTED` | URL 404/403 or MIME rejected | Display server selector, auto-switch to next server |
| `HLS_ERROR_NETWORK` | Hls.js fatal network error | Call `hls.startLoad()` once; if fails again, advance server |
| `HLS_ERROR_MEDIA` | Hls.js fatal media decode | Call `hls.recoverMediaError()`; if loops, destroy & fallback |
