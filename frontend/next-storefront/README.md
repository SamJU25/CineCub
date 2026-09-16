# 🎬 CineCub Next.js Storefront

A modern, high-performance cinema streaming web application built with **Next.js 16**, **React 19**, **TypeScript**, and **Tailwind CSS v4**.

Designed for deployment on Cloudflare Workers via `@opennextjs/cloudflare` with zero-compromise speed, dark-neon glassmorphic aesthetics, and integrated video playback.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser.

---

## 🛠️ Tech Stack & Architecture

- **Framework**: Next.js 16 (App Router)
- **UI & State**: React 19, Zustand state store
- **Styling**: Tailwind CSS v4, Vanilla CSS design tokens (`style.css`), Glassmorphism
- **Video Playback**: `hls.js`, HTML5 `<video>`, Picture-in-Picture, gesture seek
- **Identity & Persistence**: Cloudflare D1 (Edge SQLite), Cloudflare R2 (Library Storage), Web Crypto (PBKDF2 / HMAC-SHA256 JWT)
- **Deployment**: `@opennextjs/cloudflare` on Cloudflare Workers

---

## 📦 Available Scripts

| Command | Action |
|---|---|
| `npm run dev` | Starts local Next.js development server on port 3000 |
| `npm run build` | Builds production application |
| `npm run lint` | Runs ESLint checks across TypeScript components |
| `npm run preview` | Runs Cloudflare Wrangler preview simulation |
| `npm run deploy` | Builds OpenNext bundle and deploys to Cloudflare Workers |

---

## 🌐 Cloudflare Workers Deployment

To deploy to Cloudflare Workers:
```bash
npm run deploy
```
Configurations are managed in `wrangler.jsonc` and `open-next.config.ts`.
