# 🌌 StreamHeavens (Development Repository)

![Home Screen](./assets/Home.png)

This is the private codebase for **StreamHeavens**, a modern web application for discovering and streaming movies and TV series. 
**⚠️ DO NOT MAKE THIS REPOSITORY PUBLIC.**

## 🏗️ Architecture & Deployment
This project is built for Edge deployment using **Cloudflare Pages**. 
- **Frontend:** Vanilla HTML/CSS/JS.
- **Backend/Proxy:** Cloudflare Pages Functions (`/functions/api/tmdb/[[path]].js`).

The Cloudflare function intercepts `/api/tmdb/*`, injects the secret `TMDB_API_KEY`, and forwards the request to the official TMDB API. This ensures the API key is never exposed to the client browser.

## 🚀 Setup & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) & npm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (for local Cloudflare Functions testing)

### Running Locally
To test the API proxy locally along with the frontend, you should use Wrangler (Cloudflare's local development tool):
1. Install Wrangler globally if you haven't: `npm install -g wrangler`
2. Create a file named `.dev.vars` in the root directory and add your key:
   ```env
   TMDB_API_KEY=your_actual_key_here
   ```
3. Run the dev server from the root directory:
   ```bash
   npx wrangler pages dev .
   ```
4. Press `b` in the terminal to open the browser.

## 📸 Screenshots

| Home | Trending |
|------|----------|
| ![Home](./assets/Home.png) | ![Trending](./assets/Trending.png) |

| Watchlist | Sign In |
|-----------|---------|
| ![Watchlist](./assets/Watchlist.png) | ![Sign In](./assets/Sign%20In.png) |
