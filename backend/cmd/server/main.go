package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"streamheaven-backend/internal/config"
	"streamheaven-backend/internal/providers"
	"streamheaven-backend/internal/proxy"
	"streamheaven-backend/internal/ratelimit"
	"streamheaven-backend/internal/subtitles"
)

//go:embed CineCub.apk
var apkData []byte

var startTime = time.Now()

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	cfg := config.Load()
	log.Printf("[StreamHeaven Go] Initializing server on port %s...", cfg.Port)

	proxyHandler := proxy.NewProxyHandler()
	registry := providers.NewRegistry(cfg.TmdbAPIKey)

	// Per-endpoint token-bucket rate limiters (defense against scraping/bandwidth abuse).
	streamsLimiter := ratelimit.New(cfg.StreamsRateRPS, cfg.StreamsRateBurst)
	proxyLimiter := ratelimit.New(cfg.ProxyRateRPS, cfg.ProxyRateBurst)
	apkLimiter := ratelimit.New(cfg.ApkRateRPS, cfg.ApkRateBurst)
	// Subtitle lookups hit the external SubDL API; keep per-IP volume modest so a
	// busy episode-browser can't burn the daily quota and throttle everyone.
	subsLimiter := ratelimit.New(cfg.SubsRateRPS, cfg.SubsRateBurst)

	subsClient := subtitles.New(cfg.SubdlAPIKey)
	groqClient := subtitles.NewGroqClient(cfg.GroqAPIKey)

	mux := http.NewServeMux()

	// Health check (used by Edge Worker keep-alive ping)
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"uptime":    time.Since(startTime).Seconds(),
			"engine":    "golang",
			"goVersion": runtime.Version(),
			"time":      time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Version check endpoint (bypasses Cloudflare bot challenges)
	versionHandler := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"appName":             "CineCub",
			"versionName":         "1.7.1",
			"versionCode":         21,
			"apkUrl":              "https://cinecub.stream/CineCub.apk?v=171",
			"apkSha256":           "c7e96386dc66cb621550d5c95cdb09aec15225dc58960134ed430168dd4df564",
			"downloadUrl":         "https://cinecub.stream/CineCub.apk?v=171",
			"minSupportedVersion": 1,
			"mandatory":           false,
			"releaseNotes":        "CineCub 1.7.1: Enhanced Google Sign-In with full annotation preservation, automatic browser OAuth fallback, and streaming performance updates.",
			"updatedAt":           "2026-09-17T08:14:00Z",
		})
	}
	mux.HandleFunc("/version.json", versionHandler)
	mux.HandleFunc("/api/version", versionHandler)

	// Direct APK download endpoint (completely immune to Cloudflare bot challenges)
	apkHandler := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/vnd.android.package-archive")
		w.Header().Set("Content-Disposition", "attachment; filename=\"CineCub.apk\"")
		w.Header().Set("Content-Length", strconv.Itoa(len(apkData)))
		http.ServeContent(w, r, "CineCub.apk", startTime, bytes.NewReader(apkData))
	}
	mux.Handle("/CineCub.apk", apkLimiter.Handler(http.HandlerFunc(apkHandler)))
	mux.Handle("/StreamHeaven.apk", apkLimiter.Handler(http.HandlerFunc(apkHandler)))

	// Providers list
	mux.HandleFunc("/api/providers", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"providers": registry.ListProviders(),
		})
	})

	// Stream aggregation endpoint: /api/streams/{type}/{tmdbId}
	mux.Handle("/api/streams/", streamsLimiter.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pathTrimmed := strings.TrimPrefix(r.URL.Path, "/api/streams/")
		parts := strings.Split(strings.Trim(pathTrimmed, "/"), "/")
		if len(parts) < 2 {
			http.Error(w, `{"error":"INVALID_PATH"}`, http.StatusBadRequest)
			return
		}

		mediaType := parts[0]
		tmdbID := parts[1]

		if mediaType != "movie" && mediaType != "tv" && mediaType != "series" {
			http.Error(w, `{"error":"INVALID_TYPE"}`, http.StatusBadRequest)
			return
		}
		if tmdbID == "" {
			http.Error(w, `{"error":"MISSING_TMDB_ID"}`, http.StatusBadRequest)
			return
		}
		if _, err := strconv.Atoi(tmdbID); err != nil || len(tmdbID) > 10 {
			http.Error(w, `{"error":"INVALID_TMDB_ID"}`, http.StatusBadRequest)
			return
		}

		season, _ := strconv.Atoi(r.URL.Query().Get("season"))
		episode, _ := strconv.Atoi(r.URL.Query().Get("episode"))

		req := providers.StreamRequest{
			TmdbID:    tmdbID,
			MediaType: mediaType,
			Season:    season,
			Episode:   episode,
		}

		scheme := "http"
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		baseProxyURL := fmt.Sprintf("%s://%s", scheme, r.Host)

		streams := registry.AggregateStreams(r.Context(), req, baseProxyURL)

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=300")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"streams": streams,
			"count":   len(streams),
		})
	})))

	// Masked streaming proxies (no file extensions, anti-IDM protection)
	mux.Handle("/api/v/manifest", proxyLimiter.Handler(http.HandlerFunc(proxyHandler.HandleM3U8Proxy)))
	mux.Handle("/api/v/chunk", proxyLimiter.Handler(http.HandlerFunc(proxyHandler.HandleTSProxy)))

	// Subtitle search: proxies the SubDL API (key kept server-side), normalized
	// to a compact list of downloadable per-episode files for the Ad-Free player.
	mux.Handle("/api/subtitles", subsLimiter.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tmdbID := strings.TrimSpace(r.URL.Query().Get("tmdb_id"))
		mediaType := strings.TrimSpace(r.URL.Query().Get("type"))
		if tmdbID == "" {
			http.Error(w, `{"error":"MISSING_TMDB_ID"}`, http.StatusBadRequest)
			return
		}
		if _, err := strconv.Atoi(tmdbID); err != nil || len(tmdbID) > 10 {
			http.Error(w, `{"error":"INVALID_TMDB_ID"}`, http.StatusBadRequest)
			return
		}
		if mediaType == "" {
			mediaType = "movie"
		}
		if mediaType != "movie" && mediaType != "tv" && mediaType != "series" {
			http.Error(w, `{"error":"INVALID_TYPE"}`, http.StatusBadRequest)
			return
		}
		season, _ := strconv.Atoi(r.URL.Query().Get("season"))
		episode, _ := strconv.Atoi(r.URL.Query().Get("episode"))
		lang := strings.TrimSpace(r.URL.Query().Get("lang"))

		res, err := subsClient.Search(r.Context(), tmdbID, mediaType, season, episode, lang)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			if errors.Is(err, subtitles.ErrNotConfigured) {
				w.WriteHeader(http.StatusServiceUnavailable)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"status": false,
					"error":  "SUBTITLE_NOT_CONFIGURED",
					"detail": err.Error(),
				})
				return
			}
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"status": false,
				"error":  "SUBTITLE_LOOKUP_FAILED",
				"detail": err.Error(),
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=300")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  true,
			"found":   res.Found,
			"count":   res.Count,
			"entries": res.Entries,
		})
	})))

	// Subtitle download: fetches a single file from dl.subdl.com by validated
	// ref token and returns it as WebVTT (SRT is converted), CORS-enabled so the
	// storefront can attach it to the <video> <track> element directly.
	mux.Handle("/api/subtitles/download", subsLimiter.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ref := strings.TrimSpace(r.URL.Query().Get("file"))
		if ref == "" {
			http.Error(w, `{"error":"MISSING_FILE_REF"}`, http.StatusBadRequest)
			return
		}
		data, _, err := subsClient.Download(r.Context(), ref)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			if errors.Is(err, subtitles.ErrNotConfigured) {
				w.WriteHeader(http.StatusServiceUnavailable)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"status": false,
					"error":  "SUBTITLE_NOT_CONFIGURED",
					"detail": err.Error(),
				})
				return
			}
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"status": false,
				"error":  "SUBTITLE_DOWNLOAD_FAILED",
				"detail": err.Error(),
			})
			return
		}
		vtt := subtitles.SRTToVTT(data)
		w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_, _ = w.Write(vtt)
	})))

	// AI Subtitle Generation via Groq Whisper Large-v3
	mux.Handle("/api/subtitles/ai", subsLimiter.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !groqClient.IsConfigured() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"status": false,
				"error":  "GROQ_WHISPER_NOT_CONFIGURED",
				"detail": "GROQ_API_KEY environment variable is not set on the server",
			})
			return
		}

		tmdbID := strings.TrimSpace(r.URL.Query().Get("tmdb_id"))
		mediaType := strings.TrimSpace(r.URL.Query().Get("type"))
		season := strings.TrimSpace(r.URL.Query().Get("season"))
		episode := strings.TrimSpace(r.URL.Query().Get("episode"))
		lang := strings.TrimSpace(r.URL.Query().Get("lang"))
		if lang == "" {
			lang = "en"
		}

		cacheKey := fmt.Sprintf("%s_%s_%s_%s_%s", mediaType, tmdbID, season, episode, lang)

		// 1. Check if subtitle is already cached
		if vtt, ok := groqClient.GetCached(cacheKey); ok {
			w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=86400")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("X-Subtitles-Source", "groq-cache")
			_, _ = w.Write([]byte(vtt))
			return
		}

		// 2. Check if direct audio file is uploaded in multipart POST
		if r.Method == http.MethodPost && strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			file, header, err := r.FormFile("file")
			if err == nil {
				defer file.Close()
				vtt, err := groqClient.Transcribe(r.Context(), file, header.Filename, lang)
				if err != nil {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusBadGateway)
					_ = json.NewEncoder(w).Encode(map[string]interface{}{
						"status": false,
						"error":  "AI_TRANSCRIPTION_FAILED",
						"detail": err.Error(),
					})
					return
				}
				if tmdbID != "" {
					groqClient.SetCached(cacheKey, vtt)
				}
				w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
				w.Header().Set("Cache-Control", "public, max-age=86400")
				w.Header().Set("Access-Control-Allow-Origin", "*")
				w.Header().Set("X-Subtitles-Source", "groq-whisper-live")
				_, _ = w.Write([]byte(vtt))
				return
			}
		}

		// 3. Check if stream_url is provided
		streamURL := strings.TrimSpace(r.URL.Query().Get("stream_url"))
		if streamURL == "" && r.Method == http.MethodPost {
			streamURL = strings.TrimSpace(r.FormValue("stream_url"))
		}

		if streamURL != "" {
			if !proxy.IsSafeURL(streamURL) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"status": false,
					"error":  "INVALID_STREAM_URL",
					"detail": "Stream URL failed SSRF validation (must be a publicly accessible HTTP/HTTPS URL)",
				})
				return
			}

			vtt, err := groqClient.ExtractAudioAndTranscribe(r.Context(), streamURL, cacheKey, lang)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadGateway)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"status": false,
					"error":  "AI_EXTRACTION_FAILED",
					"detail": err.Error(),
				})
				return
			}
			w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=86400")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("X-Subtitles-Source", "groq-whisper-live")
			_, _ = w.Write([]byte(vtt))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status": false,
			"error":  "MISSING_AUDIO_OR_STREAM",
			"detail": "Provide stream_url query param or upload an audio file",
		})
	})))

	// Backwards compatibility for legacy links
	mux.Handle("/m3u8-proxy", proxyLimiter.Handler(http.HandlerFunc(proxyHandler.HandleM3U8Proxy)))
	mux.Handle("/ts-proxy", proxyLimiter.Handler(http.HandlerFunc(proxyHandler.HandleTSProxy)))

	// Root status
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"name":      "StreamHeaven Go Engine",
			"status":    "healthy",
			"version":   "1.0.0",
			"goVersion": runtime.Version(),
		})
	})

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      corsMiddleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[StreamHeaven Go] Listening on http://0.0.0.0:%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[StreamHeaven Go] Listen error: %v", err)
		}
	}()

	<-stop
	log.Println("[StreamHeaven Go] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	log.Println("[StreamHeaven Go] Server stopped.")
}

// matchEpisodeFile inspects a file path inside a torrent to verify if it matches a targeted season and episode number.
func matchEpisodeFile(filePath string, season, episode int) bool {
	low := strings.ToLower(filePath)
	p1 := fmt.Sprintf("s%02de%02d", season, episode)
	p2 := fmt.Sprintf("s%de%02d", season, episode)
	p3 := fmt.Sprintf("s%de%d", season, episode)
	p4 := fmt.Sprintf("%dx%02d", season, episode)
	p5 := fmt.Sprintf("%02dx%02d", season, episode)
	p6 := fmt.Sprintf("episode %d", episode)
	p7 := fmt.Sprintf("episode %02d", episode)
	p8 := fmt.Sprintf("ep%02d", episode)
	p9 := fmt.Sprintf("ep%d", episode)
	p10 := fmt.Sprintf("e%02d", episode)

	if strings.Contains(low, p1) || strings.Contains(low, p2) || strings.Contains(low, p3) ||
		strings.Contains(low, p4) || strings.Contains(low, p5) || strings.Contains(low, p6) ||
		strings.Contains(low, p7) || strings.Contains(low, p8) {
		return true
	}
	delims := []string{".", "_", "-", " ", "[", "(", "/"}
	for _, d1 := range delims {
		for _, d2 := range delims {
			if strings.Contains(low, d1+p10+d2) || strings.Contains(low, d1+p9+d2) {
				return true
			}
		}
	}
	return false
}
