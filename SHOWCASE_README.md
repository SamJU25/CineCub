<p align="center">
  <img src="./assets/Home.png" alt="StreamHeavens" width="100%" />
</p>

<h1 align="center">🌌 StreamHeavens</h1>

<p align="center">
  <strong>A premium, modern web application for discovering and streaming movies & TV series.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare" />
  <img src="https://img.shields.io/badge/TMDB_API-01B4E4?style=for-the-badge&logo=themoviedatabase&logoColor=white" alt="TMDB" />
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-gallery">Gallery</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-live-demo">Live Demo</a>
</p>

---

## 📌 About

**StreamHeavens** is a fully responsive, single-page streaming platform I designed and built from scratch using **zero frameworks** — just pure HTML, CSS, and JavaScript. It delivers a Netflix-like user experience with smooth animations, glassmorphism design, dark mode aesthetics, and powerful content discovery capabilities.

The application is powered by the [TMDB API](https://www.themoviedb.org/) for real-time movie and TV show metadata, and is deployed on **Cloudflare Pages** with edge-optimized serverless functions for secure API proxying.

---

## ✨ Features

### 🎬 Content Discovery
- **Hero Spotlight Slider** — Auto-rotating cinematic banner showcasing featured titles with ratings, genres, and one-click watch/info actions.
- **Trending Ticker** — A live scrolling ribbon displaying what's hot right now.
- **Smart Genre Chips** — Quick-filter content by Action, Comedy, Horror, Sci-Fi, Drama, Romance, Crime, Animation, Fantasy, Thriller, Adventure, and Mystery.
- **Multiple Browse Modes** — Discover content via Trending, Top Rated, Upcoming, Movies, and TV Shows.

### 🔍 Search & Navigation
- **Real-Time Search** — Debounced search with instant dropdown results including poster thumbnails, year, and media type.
- **Collapsible Sidebar** — Desktop sidebar with expand/collapse toggle. On mobile, it becomes a slide-out drawer with overlay.
- **Mobile Bottom Navigation** — Touch-optimized bottom bar for quick access on smaller screens.
- **Breadcrumb Navigation** — Always know where you are within the app.

### 📺 Streaming & Playback
- **Multi-Server Support** — Choose between 3 independent streaming providers (VidLink, VidSrc, AutoEmbed) for uninterrupted viewing.
- **TV Show Episode Selector** — Season and episode dropdowns for precise episode selection.
- **Full Detail Modal** — Rich content detail view with backdrop, poster, description, cast carousel, genre tags, runtime, and rating.
- **Tabbed Interface** — Switch between Overview, Watch, and Cast tabs within the detail modal.

### 📚 Personal Library
- **Watchlist** — Save your favorite titles for later. Synced per user account via localStorage.
- **Watch History** — Automatically tracks your last 50 watched titles with timestamps.
- **One-Click Toggle** — Add or remove from watchlist directly from poster cards, spotlight, or detail view.

### 🔐 Authentication
- **Local Auth System** — Sign Up and Login with username, email, and password. All data stored securely in the browser's localStorage.
- **Per-User Data** — Each user gets their own watchlist and watch history.
- **Profile Menu** — Quick-access profile dropdown with session status and logout.

### 🎨 Design & UX
- **Premium Dark Theme** — Deep blacks and purples with carefully tuned contrast ratios.
- **Glassmorphism Effects** — Frosted-glass modals, cards, and overlays.
- **Smooth Micro-Animations** — Hover effects, fade transitions, skeleton loading placeholders, and progress indicators.
- **Fully Responsive** — Pixel-perfect layouts from 4K monitors down to 320px mobile screens.
- **PWA Ready** — Add-to-home-screen support with custom app icon and splash configuration.

### ⚖️ Legal Compliance
- Built-in **DMCA Policy**, **Privacy Policy**, **Terms of Service**, and **Contact** modals accessible from the footer.

---

## 🖼️ Gallery

### 🏠 Home — Cinematic Hero Spotlight
> Auto-rotating featured content with backdrop imagery, ratings, genre tags, and quick action buttons.

![Home](./assets/Home.png)

---

### 🎬 Movies — Full Poster Grid
> Browse the complete movie catalog with HD/NEW badges, star ratings, and one-click watchlist hearts.

![Movies](./assets/Movies.png)

---

### 📺 TV Shows — Series Collection
> Dedicated TV show browsing with SERIES badges and multi-season support.

![TV Shows](./assets/TV%20Shows.png)

---

### 🔥 Trending — What's Hot Right Now
> Real-time trending content across movies and TV, updated weekly from TMDB.

![Trending](./assets/Trending.png)

---

### ⭐ Top Rated — Critically Acclaimed
> The highest-rated films and series curated from millions of TMDB user votes.

![Top Rated](./assets/Top%20Rated.png)

---

### 📅 Upcoming — Coming Soon
> Preview upcoming theatrical releases before they hit the screen.

![Upcoming](./assets/Upcoming.png)

---

### ❤️ Watchlist — Your Personal Collection
> Save titles you want to watch later. Fully synced to your user account.

![Watchlist](./assets/Watchlist.png)

---

### 🔑 Authentication — Secure Sign In & Sign Up

<p align="center">
  <img src="./assets/Sign%20In.png" width="48%" alt="Sign In — Glassmorphism login modal" />
  <img src="./assets/Sign%20Up.png" width="48%" alt="Sign Up — Account creation form" />
</p>

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Structure** | HTML5 (Semantic, SEO-optimized) |
| **Styling** | CSS3 — Custom Properties, Flexbox, Grid, Keyframe Animations, Glassmorphism |
| **Logic** | Vanilla JavaScript (ES6+) — No frameworks, no dependencies |
| **Icons** | FontAwesome 6.4.0 (CDN) |
| **Typography** | Google Fonts — Plus Jakarta Sans (400–900) |
| **Data** | [TMDB API v3](https://developer.themoviedb.org/) |
| **Hosting** | Cloudflare Pages (Edge CDN + Serverless Functions) |

---

## 🌐 Live Demo

> 🚧 *Coming soon — domain purchase and Cloudflare deployment in progress.*

---

## 📊 Performance Highlights

- **Zero build step** — No webpack, no bundler, no transpiler. Ship raw HTML/CSS/JS.
- **~134 KB total** — Entire application (HTML + CSS + JS) weighs under 135KB before compression.
- **Edge-cached API** — TMDB responses cached for 5 minutes at Cloudflare's edge network.
- **Lazy-loaded images** — All poster and backdrop images use `loading="lazy"` and `decoding="async"`.
- **Skeleton loading** — Placeholder shimmer animations while content loads.

---

## ⚖️ Disclaimer

This project is created as a **personal portfolio piece** to demonstrate frontend web development skills, advanced UI/UX design, and third-party API integration. The developer does not host, store, or distribute any video content. All streaming media is embedded from external third-party services.

This product uses the [TMDB API](https://www.themoviedb.org/) but is not endorsed or certified by TMDB.

---

<p align="center">
  <sub>Designed & Built with ❤️ — © 2026 StreamHeavens. All rights reserved.</sub>
</p>
