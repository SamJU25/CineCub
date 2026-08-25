# StreamHeavens

A premium, serverless movie and TV streaming application built with Vanilla JS, HTML, and CSS.

## Features
- **Accountless & Frictionless**: No signups required. Watchlist and History are saved locally to the browser.
- **Progressive Web App (PWA)**: Installable on iOS, Android, and Desktop for a native app experience.
- **Linkvertise Monetization**: Features a highly-converting unlock system to monetize the video player.
- **Serverless API Proxy**: Uses Cloudflare Workers to safely proxy TMDB requests without exposing your API key.
- **Responsive & Premium UI**: Designed with glassmorphism, dynamic hover effects, and tactile mobile feedback.

## Deployment
1. Ensure your TMDB API key is in the `.dev.vars` file.
2. Ensure your Linkvertise ID is set in `script.js`.
3. Deploy to Cloudflare Pages using `wrangler`:
   ```bash
   npx wrangler pages deploy . --project-name streamheavens
   ```
