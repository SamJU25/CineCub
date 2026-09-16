package providers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

func encodeData(raw string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

type Registry struct {
	providers []Provider
}

func NewRegistry(tmdbKey string) *Registry {
	r := &Registry{}
	// Register verified Tier 1 streaming scrapers
	r.Register(NewVidlinkProvider())
	r.Register(NewVideasyProvider(tmdbKey))
	r.Register(NewVaPlayerProvider(tmdbKey))
	r.Register(NewZXCStreamsProvider())
	r.Register(NewDahmerMoviesProvider(tmdbKey))
	// 4KHDHub file-host provider — delivers native MP4/MKV file streams the
	// ad-free/direct player depends on (routed to /api/v/chunk by aggregation).
	r.Register(NewKhdHubProvider(tmdbKey))
	return r
}

func (r *Registry) Register(p Provider) {
	r.providers = append(r.providers, p)
}

func (r *Registry) ListProviders() []string {
	names := make([]string, len(r.providers))
	for i, p := range r.providers {
		names[i] = p.Name()
	}
	return names
}

func (r *Registry) AggregateStreams(ctx context.Context, req StreamRequest, baseProxyURL string) []Stream {
	queryCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		streams []Stream
		seen    = make(map[string]bool)
	)

	for _, p := range r.providers {
		wg.Add(1)
		go func(prov Provider) {
			defer wg.Done()
			res, err := prov.GetStreams(queryCtx, req)
			if err != nil || len(res) == 0 {
				return
			}

			mu.Lock()
			defer mu.Unlock()
			for _, s := range res {
				if s.URL == "" || seen[s.URL] {
					continue
				}
				seen[s.URL] = true

				// Format URL through local streaming proxy if required
				proxiedStream := s
				if baseProxyURL != "" && !strings.Contains(s.URL, "/api/v/") && !strings.Contains(s.URL, "/m3u8-proxy") && !strings.Contains(s.URL, "/ts-proxy") {
					uLower := strings.ToLower(s.URL)
					var headersParam string
					if len(s.Headers) > 0 {
						hBytes, _ := json.Marshal(s.Headers)
						headersParam = "&h=" + encodeData(string(hBytes))
					}

					if strings.Contains(uLower, ".mp4") || strings.Contains(uLower, ".mkv") || strings.Contains(uLower, ".webm") || strings.Contains(uLower, "pixeldrain.") || strings.Contains(uLower, "googleusercontent.com") {
						proxiedStream.Format = "mp4"
						proxiedStream.URL = fmt.Sprintf("%s/api/v/chunk?d=%s%s", baseProxyURL, encodeData(s.URL), headersParam)
					} else {
						proxiedStream.Format = "hls"
						proxiedStream.URL = fmt.Sprintf("%s/api/v/manifest?d=%s%s", baseProxyURL, encodeData(s.URL), headersParam)
					}
				}

				streams = append(streams, proxiedStream)
			}
		}(p)
	}

	wg.Wait()
	sortStreams(streams)
	return streams
}

func streamQualityRank(quality, name, title string) int {
	all := strings.ToLower(quality + " " + name + " " + title)
	if strings.Contains(all, "4k") || strings.Contains(all, "2160p") {
		return 2160
	}
	if strings.Contains(all, "1440p") {
		return 1440
	}
	if strings.Contains(all, "1080p") || strings.Contains(all, "1080") {
		return 1080
	}
	if strings.Contains(all, "720p") || strings.Contains(all, "720") {
		return 720
	}
	if strings.Contains(all, "576p") {
		return 576
	}
	if strings.Contains(all, "480p") || strings.Contains(all, "480") {
		return 480
	}
	if strings.Contains(all, "360p") || strings.Contains(all, "360") {
		return 360
	}
	return 0
}

func sortStreams(streams []Stream) {
	sort.SliceStable(streams, func(i, j int) bool {
		sA, sB := streams[i], streams[j]

		// Format score: direct file streams (/api/v/chunk or mp4) win over HLS
		isChunkA := strings.Contains(sA.URL, "/api/v/chunk") || sA.Format == "mp4"
		isChunkB := strings.Contains(sB.URL, "/api/v/chunk") || sB.Format == "mp4"

		if isChunkA != isChunkB {
			return isChunkA // chunks come first
		}

		// Resolution quality score: higher resolution wins
		qA := streamQualityRank(sA.Quality, sA.Name, sA.Title)
		qB := streamQualityRank(sB.Quality, sB.Name, sB.Title)
		if qA != qB {
			return qA > qB
		}

		return false
	})
}
