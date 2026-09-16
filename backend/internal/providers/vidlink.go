package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	vidlinkBaseURL   = "https://vidlink.pro"
	vidlinkAPIURL    = "https://vidlink.pro/api/b"
	vidlinkEncURL    = "https://enc-dec.app/api/enc-vidlink"
	vidlinkUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)

// VidlinkProvider scrapes native file and HLS streams from VidLink (Server 1).
type VidlinkProvider struct {
	client *http.Client
}

// NewVidlinkProvider creates a new VidLink scraper instance.
func NewVidlinkProvider() *VidlinkProvider {
	return &VidlinkProvider{
		client: &http.Client{Timeout: 8 * time.Second},
	}
}

// Name returns the provider identifier.
func (p *VidlinkProvider) Name() string {
	return "Vidlink"
}

type vidlinkQualityEntry struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}

type vidlinkResponse struct {
	Stream struct {
		Qualities map[string]vidlinkQualityEntry `json:"qualities"`
	} `json:"stream"`
}

// GetStreams queries enc-dec and VidLink APIs to extract direct video streams.
func (p *VidlinkProvider) GetStreams(ctx context.Context, req StreamRequest) ([]Stream, error) {
	if req.TmdbID == "" {
		return nil, fmt.Errorf("missing tmdbId")
	}

	// Step 1: Encrypt the TMDB ID via enc-dec.app
	encEndpoint := fmt.Sprintf("%s?text=%s", vidlinkEncURL, url.QueryEscape(req.TmdbID))
	encReq, err := http.NewRequestWithContext(ctx, "GET", encEndpoint, nil)
	if err != nil {
		return nil, err
	}
	encReq.Header.Set("User-Agent", vidlinkUserAgent)

	encResp, err := p.client.Do(encReq)
	if err != nil {
		return nil, fmt.Errorf("vidlink encryption error: %w", err)
	}
	defer encResp.Body.Close()

	if encResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vidlink encryption returned status %d", encResp.StatusCode)
	}

	var encData struct {
		Result string `json:"result"`
	}
	if err := json.NewDecoder(encResp.Body).Decode(&encData); err != nil {
		return nil, fmt.Errorf("failed to decode vidlink encryption: %w", err)
	}

	if encData.Result == "" {
		return nil, fmt.Errorf("vidlink encryption returned empty token")
	}

	// Step 2: Fetch streams from Vidlink API
	var apiEndpoint string
	isTV := req.MediaType == "tv" || req.MediaType == "series"
	if isTV {
		season := req.Season
		if season <= 0 {
			season = 1
		}
		episode := req.Episode
		if episode <= 0 {
			episode = 1
		}
		apiEndpoint = fmt.Sprintf("%s/tv/%s/%d/%d?multiLang=0", vidlinkAPIURL, encData.Result, season, episode)
	} else {
		apiEndpoint = fmt.Sprintf("%s/movie/%s?multiLang=0", vidlinkAPIURL, encData.Result)
	}

	apiReq, err := http.NewRequestWithContext(ctx, "GET", apiEndpoint, nil)
	if err != nil {
		return nil, err
	}
	apiReq.Header.Set("User-Agent", vidlinkUserAgent)
	apiReq.Header.Set("Referer", vidlinkBaseURL)

	apiResp, err := p.client.Do(apiReq)
	if err != nil {
		return nil, fmt.Errorf("vidlink api request error: %w", err)
	}
	defer apiResp.Body.Close()

	if apiResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vidlink api returned status %d", apiResp.StatusCode)
	}

	var vlResp vidlinkResponse
	if err := json.NewDecoder(apiResp.Body).Decode(&vlResp); err != nil {
		return nil, fmt.Errorf("failed to decode vidlink api response: %w", err)
	}

	if len(vlResp.Stream.Qualities) == 0 {
		return nil, fmt.Errorf("no qualities found in vidlink response")
	}

	var streams []Stream
	for qKey, entry := range vlResp.Stream.Qualities {
		if entry.URL == "" {
			continue
		}

		format := "mp4"
		if strings.Contains(strings.ToLower(entry.URL), ".m3u8") || strings.ToLower(entry.Type) == "hls" {
			format = "hls"
		}

		label := qKey
		if !strings.HasSuffix(label, "p") && label != "4K" && label != "Auto" {
			label += "p"
		}

		streams = append(streams, Stream{
			Name:     fmt.Sprintf("Vidlink (%s)", label),
			Title:    fmt.Sprintf("Vidlink - %s", label),
			URL:      entry.URL,
			Quality:  qKey,
			Provider: p.Name(),
			Format:   format,
			Headers:  nil, // Omit Referer; bcdn.hakunaymatata.com blocks requests with Referer: https://vidlink.pro
		})
	}

	return streams, nil
}
