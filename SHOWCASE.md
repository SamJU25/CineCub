# 🌟 StreamHeaven — Project Showcase & Engineering Highlights

<div align="center">

# 🎬 StreamHeaven
### *Next-Generation Serverless Streaming Engine & Native Android Ecosystem*

[![Live Demo](https://img.shields.io/badge/Live_Website-streamheaven.online-9d4edd?style=for-the-badge&logo=googlechrome&logoColor=white)](https://streamheaven.online)
[![Android APK](https://img.shields.io/badge/Android_APK-v1.0.5-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://streamheaven.online/assets/StreamHeaven.apk)
[![Cloudflare Pages](https://img.shields.io/badge/Edge_Network-Cloudflare_Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)
[![Firebase](https://img.shields.io/badge/Auth_&_Store-Firebase_v9-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![Mailtrap](https://img.shields.io/badge/SMTP_Relay-Mailtrap-22d172?style=for-the-badge&logo=mailgun&logoColor=white)](https://mailtrap.io)

<p align="center">
  <b>StreamHeaven</b> is an end-to-end cinematic streaming platform engineered with zero third-party UI framework bloat. Featuring a hyper-responsive Dark Neon Glassmorphism interface, custom Cloudflare serverless edge security, high-throughput HLS streaming, and a dedicated native Android Kotlin application.
</p>

</div>

---

## 🎯 Executive Summary & Vision

Traditional movie streaming sites are plagued by intrusive pop-up ads, laggy UI performance, and brittle infrastructure. **StreamHeaven** was designed from the ground up to solve these problems by prioritizing:
1. **Uncompromising Speed & 120fps Smoothness**: Hardware-accelerated touch physics, zero-lag carousels, and sub-100ms API responses.
2. **True Cross-Platform Harmony**: One unified codebase powering both responsive web browsers and a dedicated Android APK with platform-aware UI toggles.
3. **Enterprise Edge Security**: Complete isolation of sensitive API credentials behind Cloudflare Edge Functions.

---

## 🎨 Product Tour & Visual Design System

```
Obsidian Base       Electric Purple     Neon Accent        Frosted Glass
  #07050A              #9D4EDD            #C77DFF        rgba(255,255,255,0.03)
 [ ■■■■■■■ ]          [ ■■■■■■■ ]        [ ■■■■■■■ ]          [ ■■■■■■■ ]
```

### 1. Interactive Hero Spotlight Slider
- **Real-Time Touch Physics**: Custom touch-tracking slider allowing users to drag slides with 1:1 finger tracking, edge resistance curves, and inertia snapping.
- **Dynamic Backdrop Tinting**: High-resolution backdrop art dynamically scaled with ambient radial gradients and progressive bottom fades.

### 2. Multi-Engine Streaming Player
- **Universal Multi-Server Fallback**: Automatic failover across 6 top embed providers (`VidLink`, `VidSrc`, `AutoEmbed`, `SuperEmbed`, `CineSrc`, `VidCore`).
- **Native Ad-Free HLS Engine**: Direct `.m3u8` video stream integration powered by `hls.js`, supporting:
  - 4K, 1080p, 720p, 480p adaptive bitrate switching.
  - Multi-language audio tracks (English, Hindi, Spanish, French, Japanese, etc.).
  - Embedded and external `.vtt` subtitles.
- **Smart Resume**: Remembers exact timestamps across movie sessions and TV episodes in local and cloud storage.

### 3. Comprehensive Catalog & Live Search
- **Instant Debounced Search**: Multi-type autocomplete returning movies, TV series, actors, and director filmographies in real time.
- **Categorized Discovery**: Trending marquees, Top-Rated masterpieces, Genre pills, and seasonal upcoming releases powered by TMDB.

### 4. Hybrid Local-First & Cloud Auth
- **Zero Friction Guest Mode**: Instant access with local Watchlist and Watch History.
- **Firebase Cloud Sync**: Authenticated users enjoy real-time Firestore sync across all their devices.
- **Mailtrap Custom SMTP Relay**: Secure, high-deliverability password recovery and OTP account verification.

---

## ⚡ Engineering Challenges & Solutions

### 🚀 1. Eliminating Mobile Scroll Lag & Enabling 120fps Momentum
- **Challenge**: Custom mouse-drag scroll listeners on horizontal movie carousels conflicted with native mobile touch compositing, causing damped, sluggish scrolling on Android and iOS.
- **Solution**: Implemented smart device detection (`'ontouchstart' in window || navigator.maxTouchPoints > 0`) to bypass JavaScript event interceptors on touch screens, enabling native GPU compositor momentum flings with `overscroll-behavior-x: contain` and `transform: translateZ(0)`.

### 🛡️ 2. Zero-Exposure Edge Serverless Proxy
- **Challenge**: Client-side TMDB API keys are easily extracted and abused by third parties.
- **Solution**: Built a serverless catch-all edge proxy (`functions/api/tmdb/[[path]].js`) on Cloudflare Pages. Client requests query `/api/tmdb/*`, and Cloudflare injects the encrypted `env.TMDB_API_KEY` server-side before forwarding to TMDB.

### 📱 3. Zero-Flash Platform Separation (Web vs. Native Android App)
- **Challenge**: The web platform requires extensive SEO articles, FAQs, and footers for Google ranking, while the native Android app requires a clean, distraction-free native UI.
- **Solution**: Created a synchronous `<head>` platform detector that immediately evaluates `StreamHeavenApp` user-agents and Android JS bridges before first paint, adding `.is-app-env` or `.is-web-env` without any visual layout shift.

### 🔄 4. Dual-Channel Continuous Delivery
- **Over-The-Air (OTA) Instant Web Updates**: Service Worker (`sw.js`) with a Network-First strategy ensures users receive fresh UI, styling, and player updates automatically upon refresh.
- **In-App APK Self-Updater**: A custom Android Kotlin updater (`AppUpdater.kt`) checking `update.json` on startup with branded progress bars and Android 8+ installation permission handling.

---

## 🛠️ Complete Technology Stack

| Layer | Technologies & Tools |
| :--- | :--- |
| **Frontend UI** | HTML5, Vanilla JavaScript (ES6+), Modern Vanilla CSS, Glassmorphism |
| **Edge & Hosting** | Cloudflare Pages, Cloudflare Pages Functions, Cloudflare DNS |
| **Mobile App** | Android SDK, Kotlin, Hardware-Accelerated WebView, In-App Updater |
| **Authentication & DB**| Firebase Authentication, Cloud Firestore (Compat SDK v9) |
| **Email Infrastructure**| Mailtrap (Custom SMTP Relay Integration) |
| **Media & APIs** | TMDB API v3, Hls.js, Multi-Provider Video Embed APIs |
| **Offline & PWA** | Web App Manifest, Service Worker Caching (`streamheaven-v264`) |

---

## 📊 Performance & Optimization Metrics

- ⚡ **First Contentful Paint (FCP)**: < 0.8s
- ⚡ **Time to Interactive (TTI)**: < 1.2s
- ⚡ **Lighthouse SEO Score**: 100 / 100
- ⚡ **Lighthouse Best Practices**: 100 / 100
- 📱 **Frame Rate**: Locked 60fps / 120fps on high-refresh mobile screens

---

## 👨‍💻 Author & Connect

- **Creator & Lead Developer**: [SamJU25](https://github.com/SamJU25)
- **Official Website**: [https://streamheaven.online](https://streamheaven.online)
- **Telegram Channel**: [@StreamHeavenOnline](https://t.me/StreamHeavenOnline)
- **Contact & Support**: [streamheaven.support@gmail.com](mailto:streamheaven.support@gmail.com)
- **Repository**: [https://github.com/SamJU25/SteamHeaven](https://github.com/SamJU25/SteamHeaven)

<div align="center">
  <sub>StreamHeaven is a demonstration of modern web engineering, edge serverless computing, and cross-platform native integration.</sub>
</div>
