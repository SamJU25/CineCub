# 🌌 StreamHeavens

> A premium, modern web application for discovering and streaming movies and TV series.

![StreamHeavens Banner](https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1200&auto=format&fit=crop)

**StreamHeavens** is a highly responsive, aesthetically pleasing streaming platform built with modern web standards. It offers a seamless user experience with fluid animations, a beautiful dark mode, and an intuitive interface designed to provide a top-tier cinematic experience. 

## ✨ Features

- **🎬 Extensive Library:** Browse through trending, top-rated, and upcoming movies and TV shows.
- **🔍 Advanced Search & Filtering:** Find exactly what you want with real-time search and smart genre filtering.
- **📺 Multi-Server Streaming:** Integrated with multiple reliable third-party streaming providers (VidLink, VidSrc, AutoEmbed) for uninterrupted viewing.
- **📚 Personal Library:** Keep track of what you want to watch with a built-in **Watchlist** and view your previously watched content in **History**.
- **📱 Fully Responsive:** Carefully crafted to work flawlessly on desktop, tablet, and mobile devices, complete with touch-friendly navigation and dynamic sidebars.
- **🎨 Premium UI/UX:** Features a sleek dark theme, elegant glassmorphism effects, and smooth micro-animations for an app-like feel.
- **⚡ Fast & Lightweight:** Built with robust Vanilla JavaScript for maximum performance without the overhead of heavy frameworks.

## 🛠️ Technologies Used

- **Frontend:** HTML5, CSS3 (Custom Variables, Flexbox/Grid, Animations), Vanilla JavaScript (ES6+)
- **Assets:** FontAwesome 6 (Icons), Google Fonts (Plus Jakarta Sans)
- **Data Provider:** [The Movie Database (TMDB) API](https://www.themoviedb.org/) for rich media metadata, images, and descriptions.

## 🚀 Getting Started

### Prerequisites
- A modern web browser.
- A [TMDB API Key](https://developer.themoviedb.org/docs/getting-started).

### Local Development
1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/streamheavens.git
   cd streamheavens
   ```

2. **Configure API Key**
   The application utilizes the TMDB API for fetching content. If you are deploying via Cloudflare Workers or a similar serverless platform (as planned), configure your environment variable in your deployment dashboard:
   ```env
   TMDB_API_KEY=your_api_key_here
   ```
   *Note: For local testing, ensure your local dev server or proxy (if implemented) is set up to append this API key to TMDB requests.*

3. **Run the App**
   Serve the directory using any local web server (e.g., VS Code Live Server, Python's `http.server`, or `serve`).
   ```bash
   npx serve .
   ```
   Navigate to the local URL (e.g., `http://localhost:3000`) in your browser to view the app.

## 🌐 Deployment & Architecture

StreamHeavens is architected to be edge-ready, making it perfect for deployment on platforms like **Cloudflare Pages** or **Vercel**. By utilizing serverless functions or edge workers, you can securely store your `TMDB_API_KEY` and proxy API requests without exposing your credentials to the client.

## ⚖️ Disclaimer

This project is created for **educational purposes** and as a personal portfolio piece to demonstrate frontend web development skills, advanced UI/UX design, and third-party API integration. The developer does not host, store, or distribute any of the video content. All streaming media is embedded from external third-party services.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page if you want to contribute.

## 📜 License

Distributed under the MIT License.
