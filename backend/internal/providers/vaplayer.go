package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"streamheaven-backend/internal/utils"
)

const (
	vaPlayerStreamAPI  = "https://streamdata.vaplayer.ru/api.php"
	vaPlayerOrigin     = "https://nextgencloudfabric.com"
	vaPlayerUserAgent  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

type VaPlayerProvider struct {
	client     *http.Client
	tmdbAPIKey string
}

func NewVaPlayerProvider(tmdbKey string) *VaPlayerProvider {
	return &VaPlayerProvider{
		client:     &http.Client{Timeout: 8 * time.Second},
		tmdbAPIKey: tmdbKey,
	}
}

func (p *VaPlayerProvider) Name() string {
	return "VaPlayer"
}

type vaPlayerResponse struct {
	StatusCode interface{} `json:"status_code"`
	Error      string      `json:"error"`
	Data       struct {
		StreamURLs []string `json:"stream_urls"`
	} `json:"data"`
}

func (p *VaPlayerProvider) resolveIMDB(ctx context.Context, mediaType, tmdbID string) (string, error) {
	if p.tmdbAPIKey == "" {
		// Fallback public demo keys or direct IMDB ID if already prefixed with tt
		return "", fmt.Errorf("missing tmdb api key")
	}

	endpoint := fmt.Sprintf("https://api.themoviedb.org/3/%s/%s/external_ids?api_key=%s", mediaType, tmdbID, p.tmdbAPIKey)
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return "", err
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("tmdb external_ids status: %d", resp.StatusCode)
	}

	var data struct {
		ImdbID string `json:"imdb_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}
	return data.ImdbID, nil
}

func (p *VaPlayerProvider) GetStreams(ctx context.Context, req StreamRequest) ([]Stream, error) {
	mType := req.MediaType
	if mType == "series" {
		mType = "tv"
	}

	meta, err := utils.GetTMDBMeta(ctx, mType, req.TmdbID, p.tmdbAPIKey)
	if err != nil || meta.ImdbID == "" {
		return nil, fmt.Errorf("failed to resolve imdb id: %w", err)
	}
	imdbID := meta.ImdbID

	q := url.Values{}
	q.Set("imdb", imdbID)
	q.Set("type", mType)
	if mType == "tv" && req.Season > 0 && req.Episode > 0 {
		q.Set("season", fmt.Sprintf("%d", req.Season))
		q.Set("episode", fmt.Sprintf("%d", req.Episode))
	}

	apiURL := fmt.Sprintf("%s?%s", vaPlayerStreamAPI, q.Encode())

	var referer string
	if mType == "tv" {
		referer = fmt.Sprintf("%s/embed/tv/%s/%d/%d", vaPlayerOrigin, imdbID, req.Season, req.Episode)
	} else {
		referer = fmt.Sprintf("%s/embed/movie/%s", vaPlayerOrigin, imdbID)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("User-Agent", vaPlayerUserAgent)
	httpReq.Header.Set("Referer", referer)
	httpReq.Header.Set("Origin", vaPlayerOrigin)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vaplayer api error: %d", resp.StatusCode)
	}

	var parsed vaPlayerResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	var results []Stream
	for i, streamURL := range parsed.Data.StreamURLs {
		if streamURL == "" {
			continue
		}
		title := fmt.Sprintf("VaPlayer · HLS %d", i+1)
		if mType == "tv" {
			title = fmt.Sprintf("VaPlayer S%dE%d · HLS %d", req.Season, req.Episode, i+1)
		}

		results = append(results, Stream{
			Name:     "VaPlayer",
			Title:    title,
			URL:      streamURL,
			Quality:  "Auto",
			Provider: "VaPlayer",
			Headers: map[string]string{
				"Referer":    vaPlayerOrigin + "/",
				"Origin":     vaPlayerOrigin,
				"User-Agent": vaPlayerUserAgent,
			},
		})
	}

	return results, nil
}
