package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 8 * time.Second}

type TMDBMeta struct {
	Title         string
	OriginalTitle string
	Year          string
	ImdbID        string
}

func GetTMDBMeta(ctx context.Context, mediaType, tmdbID, apiKey string) (*TMDBMeta, error) {
	if mediaType == "series" {
		mediaType = "tv"
	}

	var meta TMDBMeta

	// 1. Fetch details (title, year)
	var detailsURL string
	if apiKey != "" {
		detailsURL = fmt.Sprintf("https://api.themoviedb.org/3/%s/%s?api_key=%s", mediaType, tmdbID, apiKey)
	} else {
		detailsURL = fmt.Sprintf("https://cinecub.stream/api/tmdb/%s/%s", mediaType, tmdbID)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", detailsURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 CineCub-Go/1.0")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("TMDB details request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TMDB details returned status: %d", resp.StatusCode)
	}

	var data struct {
		Title         string `json:"title"`
		Name          string `json:"name"`
		OriginalTitle string `json:"original_title"`
		OriginalName  string `json:"original_name"`
		ReleaseDate   string `json:"release_date"`
		FirstAirDate  string `json:"first_air_date"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("TMDB details decode failed: %w", err)
	}

	meta.Title = data.Title
	if meta.Title == "" {
		meta.Title = data.Name
	}
	meta.OriginalTitle = data.OriginalTitle
	if meta.OriginalTitle == "" {
		meta.OriginalTitle = data.OriginalName
	}
	date := data.ReleaseDate
	if date == "" {
		date = data.FirstAirDate
	}
	if len(date) >= 4 {
		meta.Year = date[:4]
	}

	// 2. Fetch external IDs (imdb_id)
	var extURL string
	if apiKey != "" {
		extURL = fmt.Sprintf("https://api.themoviedb.org/3/%s/%s/external_ids?api_key=%s", mediaType, tmdbID, apiKey)
	} else {
		extURL = fmt.Sprintf("https://cinecub.stream/api/tmdb/%s/%s/external_ids", mediaType, tmdbID)
	}

	reqExt, err := http.NewRequestWithContext(ctx, "GET", extURL, nil)
	if err == nil {
		reqExt.Header.Set("User-Agent", "Mozilla/5.0 CineCub-Go/1.0")
		respExt, err := httpClient.Do(reqExt)
		if err == nil {
			defer respExt.Body.Close()
			if respExt.StatusCode == http.StatusOK {
				var extData struct {
					ImdbID string `json:"imdb_id"`
				}
				if err := json.NewDecoder(respExt.Body).Decode(&extData); err == nil {
					meta.ImdbID = strings.TrimSpace(extData.ImdbID)
				}
			}
		}
	}

	return &meta, nil
}
