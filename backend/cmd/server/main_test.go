package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"streamheaven-backend/internal/providers"
	"streamheaven-backend/internal/proxy"
	"streamheaven-backend/internal/utils"
)

func TestHealthEndpoint(t *testing.T) {
	req, err := http.NewRequest("GET", "/api/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","engine":"golang"}`))
	})

	mux.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}
}

func TestSSRFProtection(t *testing.T) {
	blockedURLs := []string{
		"http://127.0.0.1/admin",
		"http://localhost:3000",
		"http://169.254.169.254/latest/meta-data",
		"http://10.0.0.1/internal",
		"http://192.168.1.1/router",
		"ftp://example.com/file",
	}

	for _, u := range blockedURLs {
		if proxy.IsSafeURL(u) {
			t.Errorf("IsSafeURL allowed unsafe URL: %s", u)
		}
	}

	allowedURLs := []string{
		"https://google.com",
		"https://api.themoviedb.org",
		"https://scalableimpactgroup.site",
	}

	for _, u := range allowedURLs {
		if !proxy.IsSafeURL(u) {
			t.Errorf("IsSafeURL blocked safe public URL: %s", u)
		}
	}
}

func TestTMDBFallbackMeta(t *testing.T) {
	ctx := context.Background()
	meta, err := utils.GetTMDBMeta(ctx, "movie", "693134", "")
	if err != nil {
		t.Fatalf("GetTMDBMeta failed: %v", err)
	}

	if meta.Title != "Dune: Part Two" {
		t.Errorf("expected Title 'Dune: Part Two', got '%s'", meta.Title)
	}
	if meta.Year != "2024" {
		t.Errorf("expected Year '2024', got '%s'", meta.Year)
	}
}

func TestRegistryAggregation(t *testing.T) {
	reg := providers.NewRegistry("")
	provs := reg.ListProviders()
	if len(provs) == 0 {
		t.Fatalf("expected registered providers, got 0")
	}

	ctx := context.Background()
	streams := reg.AggregateStreams(ctx, providers.StreamRequest{
		TmdbID:    "693134",
		MediaType: "movie",
	}, "http://localhost:3000")

	t.Logf("Aggregated %d streams for Dune: Part Two", len(streams))
	if len(streams) == 0 {
		t.Errorf("expected at least 1 stream, got 0")
	}
}
