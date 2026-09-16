package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestAllowWithinBurst(t *testing.T) {
	l := New(100, 5) // 100 rps, burst 5
	key := "1.2.3.4"

	for i := 0; i < 5; i++ {
		if !l.Allow(key) {
			t.Fatalf("request %d denied, want allowed within burst", i+1)
		}
	}
	if l.Allow(key) {
		t.Fatal("request beyond burst should be denied")
	}
}

func TestAllowRefills(t *testing.T) {
	l := New(1000, 1) // fast refill, burst 1
	key := "5.6.7.8"

	if !l.Allow(key) {
		t.Fatal("first request should be allowed")
	}
	if l.Allow(key) {
		t.Fatal("second immediate request should be denied")
	}
	time.Sleep(5 * time.Millisecond)
	if !l.Allow(key) {
		t.Fatal("request after refill should be allowed")
	}
}

func TestClientIPPriority(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "203.0.113.10:1234"
	r.Header.Set("X-Forwarded-For", "198.51.100.5, 203.0.113.10")
	r.Header.Set("CF-Connecting-IP", "192.0.2.99")

	if got := ClientIP(r); got != "192.0.2.99" {
		t.Fatalf("ClientIP() = %q, want CF-Connecting-IP priority 192.0.2.99", got)
	}

	r.Header.Del("CF-Connecting-IP")
	if got := ClientIP(r); got != "198.51.100.5" {
		t.Fatalf("ClientIP() = %q, want first X-Forwarded-For 198.51.100.5", got)
	}

	r.Header.Del("X-Forwarded-For")
	if got := ClientIP(r); got != "203.0.113.10" {
		t.Fatalf("ClientIP() = %q, want RemoteAddr host 203.0.113.10", got)
	}
}

func TestHandlerReturns429(t *testing.T) {
	l := New(0.0001, 1) // burst 1, then deny
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	h := l.Handler(inner)

	// First passes.
	req := httptest.NewRequest(http.MethodGet, "/api/v/chunk", nil)
	req.RemoteAddr = "10.0.0.1:4000"
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("first request status = %d, want 200", rr.Code)
	}

	// Second is throttled.
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("second request status = %d, want 429", rr.Code)
	}
	if rr.Header().Get("Retry-After") == "" {
		t.Fatal("expected Retry-After header on 429")
	}
	if body := rr.Body.String(); body == "" {
		t.Fatal("expected JSON error body on 429")
	}
}

func TestConcurrentSafety(t *testing.T) {
	l := New(1000, 1000)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				l.Allow("same-ip")
			}
		}()
	}
	wg.Wait()
	// No panics = pass; additionally ensure the bucket is prunable later.
	l.gc(time.Now().Add(31 * time.Minute))
}
