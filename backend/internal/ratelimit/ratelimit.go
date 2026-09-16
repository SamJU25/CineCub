package ratelimit

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Limiter implements a per-client token-bucket rate limiter keyed by IP.
// It is safe for concurrent use.
type Limiter struct {
	rate  float64 // tokens added per second
	burst float64 // maximum bucket capacity

	mu      sync.Mutex
	buckets map[string]*bucket
	lastGC  time.Time
	gcEvery time.Duration
}

type bucket struct {
	tokens float64
	last   time.Time
}

// New creates a Limiter that allows up to burst requests at once and refills
// at rate requests per second. A goroutine is NOT spawned; instead buckets are
// pruned lazily during Allow so there is no leaked goroutine.
func New(rate float64, burst float64) *Limiter {
	if rate <= 0 {
		rate = 1
	}
	if burst <= 0 {
		burst = rate
	}
	// Refill is proportional to elapsed time, so no ticker goroutine is needed.
	return &Limiter{
		rate:    rate,
		burst:   burst,
		buckets: make(map[string]*bucket),
		lastGC:  time.Now(),
		gcEvery: 5 * time.Minute,
	}
}

// ClientIP returns the best-effort client IP, preferring Cloudflare's
// CF-Connecting-IP header, then the first X-Forwarded-For, then the remote
// address. Render sits behind Cloudflare, so CF-Connecting-IP is authoritative.
func ClientIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return strings.TrimSpace(ip)
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if first := strings.TrimSpace(strings.Split(xff, ",")[0]); first != "" {
			return first
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil && host != "" {
		return host
	}
	return "unknown"
}

// Allow reports whether a request from key is permitted at this instant,
// consuming one token when it is.
func (l *Limiter) Allow(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()

	l.gc(now)

	b, ok := l.buckets[key]
	if !ok {
		// Fresh bucket starts full minus the token this request consumes.
		b = &bucket{tokens: l.burst - 1.0, last: now}
		l.buckets[key] = b
		return true
	}

	// Refill proportional to elapsed time so any interval works without a ticker.
	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now

	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// gc removes buckets idle for more than 30 minutes to bound memory growth.
func (l *Limiter) gc(now time.Time) {
	if now.Sub(l.lastGC) < l.gcEvery {
		return
	}
	idleBefore := now.Add(-30 * time.Minute)
	for k, b := range l.buckets {
		if b.last.Before(idleBefore) {
			delete(l.buckets, k)
		}
	}
	l.lastGC = now
}

// Handler wraps next with per-IP rate limiting. When the limit is exceeded it
// responds 429 with a JSON body and a Retry-After header.
func (l *Limiter) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.Allow(ClientIP(r)) {
			retryAfter := int((1 / l.rate) + 0.5)
			if retryAfter < 1 {
				retryAfter = 1
			}
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error":       "RATE_LIMIT_EXCEEDED",
				"retry_after": retryAfter,
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}
