package providers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/bits"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"streamheaven-backend/internal/utils"
)

const (
	videasyAPI       = "https://api.speedracelight.com"
	videasyOrigin    = "https://player.videasy.net"
	videasyReferer   = "https://player.videasy.net/"
	videasyUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)

var (
	videasyHashTable = [16]uint32{
		1116352408, 1899447441, 3049323471, 3921009573,
		961987163, 1508970993, 2453635748, 2870763221,
		3624381080, 310598401, 607225278, 1426881987,
		1925078388, 2162078206, 2614888103, 3248222580,
	}
)

type VideasyProvider struct {
	client     *http.Client
	tmdbAPIKey string
}

func NewVideasyProvider(tmdbKey string) *VideasyProvider {
	return &VideasyProvider{
		client:     &http.Client{Timeout: 8 * time.Second},
		tmdbAPIKey: tmdbKey,
	}
}

func (p *VideasyProvider) Name() string {
	return "Videasy"
}

func rotl32(x uint32, n uint) uint32 {
	return bits.RotateLeft32(x, int(n&31))
}

func hash32(x uint32) uint32 {
	x ^= x >> 16
	x *= 2246822507
	x ^= x >> 13
	x *= 3266489909
	x ^= x >> 16
	return x
}

func fnv1a(str string) uint32 {
	var h uint32 = 2166136261
	for i := 0; i < len(str); i++ {
		h = (h ^ uint32(str[i])) * 16777619
	}
	return hash32(h)
}

type vStreamState struct {
	S   [61]uint32
	acc uint32
}

func initVStream(seed string, secondKey uint32) *vStreamState {
	st := &vStreamState{}
	a := hash32(fnv1a(seed) ^ hash32(secondKey^2654435769))
	for i := 0; i < 8; i++ {
		if ((i * (i + 1)) & 1) == 0 {
			idx := a % 61
			a = rotl32(a+2654435769, uint(7+(7&i)))
			st.S[idx] = a ^ hash32(a)
			a = hash32(a + idx)
		} else {
			st.S[i] = videasyHashTable[15&i]
		}
	}
	st.acc = hash32(2779096485 ^ a)
	return st
}

func nextVByte(st *vStreamState, ctr uint32) uint32 {
	n := st.acc % 61
	d := st.S[n]
	x := d ^ (2654435769 * (ctr + 1))
	y := (st.acc ^ x) | (st.acc & x & 0xFFFFFFFF)
	no := hash32(rotl32(y+st.acc, uint(31&n))^rotl32(st.acc, uint(31&(n*7))) + 2654435769)
	st.S[n] = no
	st.acc = no
	return no
}

func decryptVideasy(encoded string, seed string, secondKey uint32) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	if len(raw) < 4 || raw[0] != 109 || raw[1] != 118 || raw[2] != 109 || raw[3] != 49 {
		return nil, fmt.Errorf("invalid magic prefix")
	}

	payload := raw[4:]
	st := initVStream(seed, secondKey)
	plain := make([]byte, len(payload))
	var ctr uint32 = 0
	for i := 0; i < len(payload); {
		b := nextVByte(st, ctr)
		ctr++
		plain[i] = payload[i] ^ byte(b&0xFF)
		i++
		if i < len(payload) {
			plain[i] = payload[i] ^ byte((b>>8)&0xFF)
			i++
		}
	}
	return plain, nil
}

type videasySource struct {
	URL     string `json:"url"`
	Quality string `json:"quality"`
}

type videasyResponse struct {
	Sources []videasySource `json:"sources"`
}

func (p *VideasyProvider) getTMDBMeta(ctx context.Context, mediaType, tmdbID string) (string, string, error) {
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

func (p *VideasyProvider) GetStreams(ctx context.Context, req StreamRequest) ([]Stream, error) {
	tmdbNum, _ := strconv.Atoi(req.TmdbID)
	mType := req.MediaType
	if mType == "series" {
		mType = "tv"
	}

	meta, _ := utils.GetTMDBMeta(ctx, mType, req.TmdbID, p.tmdbAPIKey)
	title := req.TmdbID
	year := ""
	if meta != nil && meta.Title != "" {
		title = meta.Title
		year = meta.Year
	}

	// Fetch active seed
	seedReq, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/seed?mediaId=%s", videasyAPI, req.TmdbID), nil)
	if err != nil {
		return nil, err
	}
	seedReq.Header.Set("User-Agent", videasyUserAgent)
	seedReq.Header.Set("Referer", videasyReferer)
	seedReq.Header.Set("Origin", videasyOrigin)

	seedResp, err := p.client.Do(seedReq)
	if err != nil {
		return nil, err
	}
	defer seedResp.Body.Close()

	var seedData struct {
		Seed string `json:"seed"`
	}
	_ = json.NewDecoder(seedResp.Body).Decode(&seedData)
	activeSeed := seedData.Seed
	if activeSeed == "" {
		activeSeed = "0"
	}

	serverEndpoints := map[string]string{
		"CDN":     fmt.Sprintf("%s/cdn/sources-with-title", videasyAPI),
		"LaMovie": fmt.Sprintf("%s/lamovie/sources-with-title", videasyAPI),
	}
	if mType == "movie" {
		serverEndpoints["Meine"] = fmt.Sprintf("%s/meine/sources-with-title", videasyAPI)
	}

	var (
		mu         sync.Mutex
		wg         sync.WaitGroup
		allStreams []Stream
		seen       = make(map[string]bool)
	)

	titles := []string{title}
	if meta != nil && meta.OriginalTitle != "" && meta.OriginalTitle != title {
		titles = append(titles, meta.OriginalTitle)
	}

	for sName, sURL := range serverEndpoints {
		wg.Add(1)
		go func(name, targetURL string) {
			defer wg.Done()

			for _, t := range titles {
				q := url.Values{}
				q.Set("title", t)
				if mType == "tv" {
					q.Set("mediaType", "TV Series")
					q.Set("seasonId", strconv.Itoa(req.Season))
					q.Set("episodeId", strconv.Itoa(req.Episode))
				} else {
					q.Set("mediaType", "Movie")
				}
				q.Set("year", year)
				q.Set("tmdbId", req.TmdbID)
				q.Set("enc", "2")
				q.Set("seed", activeSeed)

				fullURL := fmt.Sprintf("%s?%s", targetURL, q.Encode())
				hReq, err := http.NewRequestWithContext(ctx, "GET", fullURL, nil)
				if err != nil {
					continue
				}
				hReq.Header.Set("User-Agent", videasyUserAgent)
				hReq.Header.Set("Referer", videasyReferer)
				hReq.Header.Set("Origin", videasyOrigin)

				resp, err := p.client.Do(hReq)
				if err != nil || resp.StatusCode != http.StatusOK {
					continue
				}

				bodyBytes, err := io.ReadAll(resp.Body)
				resp.Body.Close()
				if err != nil || len(bodyBytes) < 20 {
					continue
				}

				plain, err := decryptVideasy(string(bodyBytes), activeSeed, uint32(tmdbNum))
				if err != nil {
					continue
				}

				var resData videasyResponse
				if err := json.Unmarshal(plain, &resData); err != nil {
					continue
				}

				if len(resData.Sources) > 0 {
					mu.Lock()
					for _, s := range resData.Sources {
						if s.URL == "" || seen[s.URL] {
							continue
						}
						seen[s.URL] = true
						qStr := s.Quality
						if qStr == "" {
							qStr = "Auto"
						}

						allStreams = append(allStreams, Stream{
							Name:     fmt.Sprintf("Videasy %s", name),
							Title:    fmt.Sprintf("Videasy %s - %s", name, qStr),
							URL:      s.URL,
							Quality:  qStr,
							Provider: "Videasy",
							Headers:  map[string]string{}, // Empty headers to avoid upstream 403 blocks!
						})
					}
					mu.Unlock()
					break // Successfully found streams for this endpoint with this title
				}
			}
		}(sName, sURL)
	}

	wg.Wait()
	return allStreams, nil
}
