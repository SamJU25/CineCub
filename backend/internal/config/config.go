package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port            string
	TmdbAPIKey      string
	SubdlAPIKey     string
	GroqAPIKey      string
	CorsOrigins     []string
	EnableProxy     bool
	CacheTTLMinutes int

	// Per-endpoint rate limiting (requests/sec, burst tokens per IP).
	StreamsRateRPS   float64
	StreamsRateBurst float64
	ProxyRateRPS     float64
	ProxyRateBurst   float64
	ApkRateRPS       float64
	ApkRateBurst     float64
	SubsRateRPS      float64
	SubsRateBurst    float64
}

func floatEnv(key string, def float64) float64 {
	if raw := os.Getenv(key); raw != "" {
		if v, err := strconv.ParseFloat(raw, 64); err == nil && v > 0 {
			return v
		}
	}
	return def
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "10000"
	}

	origins := []string{"*"}
	if rawOrigins := os.Getenv("CORS_ORIGINS"); rawOrigins != "" {
		parts := strings.Split(rawOrigins, ",")
		var cleaned []string
		for _, p := range parts {
			t := strings.TrimSpace(p)
			if t != "" {
				cleaned = append(cleaned, t)
			}
		}
		if len(cleaned) > 0 {
			origins = cleaned
		}
	}

	enableProxy := true
	if ep := os.Getenv("ENABLE_PROXY"); ep == "false" || ep == "0" {
		enableProxy = false
	}

	cacheTTL := 30
	if rawTTL := os.Getenv("CACHE_TTL_MINUTES"); rawTTL != "" {
		if val, err := strconv.Atoi(rawTTL); err == nil && val > 0 {
			cacheTTL = val
		}
	}

	return &Config{
		Port:            port,
		TmdbAPIKey:      os.Getenv("TMDB_API_KEY"),
		SubdlAPIKey:     os.Getenv("SUBDL_API_KEY"),
		GroqAPIKey:      os.Getenv("GROQ_API_KEY"),
		CorsOrigins:     origins,
		EnableProxy:     enableProxy,
		CacheTTLMinutes: cacheTTL,

		// Stream aggregation is expensive (hits every scraper), so cap it tight.
		StreamsRateRPS:   floatEnv("RATE_LIMIT_STREAMS_RPS", 2),
		StreamsRateBurst: floatEnv("RATE_LIMIT_STREAMS_BURST", 40),
		// Media proxy traffic is bursty during playback (one chunk per few seconds),
		// so allow a higher sustained rate but bound the burst.
		ProxyRateRPS:   floatEnv("RATE_LIMIT_PROXY_RPS", 10),
		ProxyRateBurst: floatEnv("RATE_LIMIT_PROXY_BURST", 80),
		// APK is a large binary download; keep it low to avoid bandwidth abuse.
		ApkRateRPS:   floatEnv("RATE_LIMIT_APK_RPS", 0.2),
		ApkRateBurst: floatEnv("RATE_LIMIT_APK_BURST", 5),
		// Subtitle search/download hit the external SubDL API with a daily quota.
		SubsRateRPS:   floatEnv("RATE_LIMIT_SUBS_RPS", 4),
		SubsRateBurst: floatEnv("RATE_LIMIT_SUBS_BURST", 20),
	}
}
