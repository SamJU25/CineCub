package providers

import (
	"context"
	"testing"
	"time"
)

func TestVidlinkProvider_Name(t *testing.T) {
	p := NewVidlinkProvider()
	if p.Name() != "Vidlink" {
		t.Errorf("expected name Vidlink, got %s", p.Name())
	}
}

func TestVidlinkProvider_MissingTmdbID(t *testing.T) {
	p := NewVidlinkProvider()
	_, err := p.GetStreams(context.Background(), StreamRequest{})
	if err == nil {
		t.Error("expected error for empty tmdbId, got nil")
	}
}

func TestVidlinkProvider_GetStreams_Movie(t *testing.T) {
	p := NewVidlinkProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	streams, err := p.GetStreams(ctx, StreamRequest{
		TmdbID:    "550", // Fight Club
		MediaType: "movie",
	})
	if err != nil {
		t.Fatalf("unexpected error fetching movie streams: %v", err)
	}

	if len(streams) == 0 {
		t.Fatal("expected at least one stream, got 0")
	}

	for _, s := range streams {
		if s.URL == "" {
			t.Errorf("empty stream URL encountered: %+v", s)
		}
		if s.Provider != "Vidlink" {
			t.Errorf("expected provider Vidlink, got %s", s.Provider)
		}
		t.Logf("Found stream: %s | Quality: %s | Format: %s | URL: %s", s.Title, s.Quality, s.Format, s.URL)
	}
}

func TestVidlinkProvider_GetStreams_TV(t *testing.T) {
	p := NewVidlinkProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	streams, err := p.GetStreams(ctx, StreamRequest{
		TmdbID:    "1396", // Breaking Bad
		MediaType: "tv",
		Season:    1,
		Episode:   1,
	})
	if err != nil {
		t.Fatalf("unexpected error fetching tv streams: %v", err)
	}

	if len(streams) == 0 {
		t.Fatal("expected at least one stream, got 0")
	}

	for _, s := range streams {
		if s.URL == "" {
			t.Errorf("empty stream URL encountered: %+v", s)
		}
		if s.Provider != "Vidlink" {
			t.Errorf("expected provider Vidlink, got %s", s.Provider)
		}
		t.Logf("Found TV stream: %s | Quality: %s | Format: %s", s.Title, s.Quality, s.Format)
	}
}
