package providers

import (
	"context"
)

// Stream represents a playable media stream returned to the frontend.
type Stream struct {
	Name     string            `json:"name"`
	Title    string            `json:"title"`
	URL      string            `json:"url"`
	Quality  string            `json:"quality"`
	Provider string            `json:"provider"`
	Format   string            `json:"format,omitempty"` // "hls" or "mp4"
	Headers  map[string]string `json:"headers,omitempty"`
}

// StreamRequest contains parameters for querying streams.
type StreamRequest struct {
	TmdbID    string `json:"tmdbId"`
	MediaType string `json:"mediaType"` // "movie" or "tv" / "series"
	Season    int    `json:"season"`    // 0 if movie
	Episode   int    `json:"episode"`   // 0 if movie
}

// Provider defines the interface for all streaming scrapers.
type Provider interface {
	Name() string
	GetStreams(ctx context.Context, req StreamRequest) ([]Stream, error)
}
