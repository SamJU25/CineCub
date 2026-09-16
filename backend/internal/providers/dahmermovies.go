package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"streamheaven-backend/internal/utils"
)

const (
	dahmerAPI = "https://a.111477.xyz"
	dahmerUA  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

var linkRegex = regexp.MustCompile(`href=["']([^"']*\.(mkv|mp4|avi|webm|m3u8))["']`)

type DahmerMoviesProvider struct {
	client     *http.Client
	tmdbAPIKey string
}

func NewDahmerMoviesProvider(tmdbKey string) *DahmerMoviesProvider {
	return &DahmerMoviesProvider{
		client:     &http.Client{Timeout: 8 * time.Second},
		tmdbAPIKey: tmdbKey,
	}
}

func (p *DahmerMoviesProvider) Name() string {
	return "DahmerMovies"
}

func (p *DahmerMoviesProvider) getTMDBMeta(ctx context.Context, mediaType, tmdbID string) (string, string, error) {
	endpoint := fmt.Sprintf("https://api.themoviedb.org/3/%s/%s?api_key=%s", mediaType, tmdbID, p.tmdbAPIKey)
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return "", "", err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var data struct {
		Title        string `json:"title"`
		Name         string `json:"name"`
		ReleaseDate  string `json:"release_date"`
		FirstAirDate string `json:"first_air_date"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", "", err
	}

	title := data.Title
	if title == "" {
		title = data.Name
	}
	date := data.ReleaseDate
	if date == "" {
		date = data.FirstAirDate
	}
	year := ""
	if len(date) >= 4 {
		year = date[:4]
	}
	return title, year, nil
}

func (p *DahmerMoviesProvider) GetStreams(ctx context.Context, req StreamRequest) ([]Stream, error) {
	mType := req.MediaType
	if mType == "series" {
		mType = "tv"
	}

	meta, err := utils.GetTMDBMeta(ctx, mType, req.TmdbID, p.tmdbAPIKey)
	if err != nil || meta.Title == "" {
		return nil, fmt.Errorf("failed to fetch metadata: %w", err)
	}
	year := meta.Year
	titles := []string{meta.Title}
	if meta.OriginalTitle != "" && meta.OriginalTitle != meta.Title {
		titles = append(titles, meta.OriginalTitle)
	}

	var variants []string
	for _, t := range titles {
		cleanTitle := strings.ReplaceAll(t, ":", "")
		cleanTitle = strings.TrimSpace(cleanTitle)
		if cleanTitle == "" {
			continue
		}
		if mType == "tv" {
			variants = append(variants,
				fmt.Sprintf("/tvs/%s/Season%%20%02d/", url.PathEscape(cleanTitle), req.Season),
				fmt.Sprintf("/tvs/%s/Season%%20%d/", url.PathEscape(cleanTitle), req.Season),
				fmt.Sprintf("/tvs/%s/", url.PathEscape(cleanTitle)),
			)
		} else {
			folder := fmt.Sprintf("%s (%s)", cleanTitle, year)
			variants = append(variants,
				fmt.Sprintf("/movies/%s/", url.PathEscape(folder)),
				fmt.Sprintf("/movies/%s/", url.PathEscape(cleanTitle)),
			)
		}
	}

	var htmlContent string
	var finalDir string

	for _, v := range variants {
		target := dahmerAPI + v
		hReq, err := http.NewRequestWithContext(ctx, "GET", target, nil)
		if err != nil {
			continue
		}
		hReq.Header.Set("User-Agent", dahmerUA)
		hReq.Header.Set("Referer", dahmerAPI+"/")

		resp, err := p.client.Do(hReq)
		if err == nil && resp.StatusCode == http.StatusOK {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			htmlContent = string(b)
			finalDir = target
			break
		}
		if resp != nil {
			resp.Body.Close()
		}
	}

	if htmlContent == "" {
		return nil, fmt.Errorf("no directory found on 111477.xyz")
	}

	matches := linkRegex.FindAllStringSubmatch(htmlContent, -1)
	var streams []Stream
	seen := make(map[string]bool)

	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		href := m[1]
		if seen[href] {
			continue
		}
		seen[href] = true

		fullURL := href
		if !strings.HasPrefix(href, "http") {
			if strings.HasPrefix(href, "/") {
				fullURL = dahmerAPI + href
			} else {
				fullURL = finalDir + href
			}
		}

		quality := "1080p"
		lowerHref := strings.ToLower(href)
		if strings.Contains(lowerHref, "2160p") || strings.Contains(lowerHref, "4k") {
			quality = "2160p"
		} else if strings.Contains(lowerHref, "720p") {
			quality = "720p"
		}

		titleName := "DahmerMovies Direct"
		if len(href) > 20 {
			titleName = fmt.Sprintf("DahmerMovies (%s)", quality)
		}

		streams = append(streams, Stream{
			Name:     "DahmerMovies",
			Title:    titleName,
			URL:      fullURL,
			Quality:  quality,
			Provider: "DahmerMovies",
			Headers: map[string]string{
				"User-Agent": dahmerUA,
				"Referer":    dahmerAPI + "/",
			},
		})
	}

	return streams, nil
}
