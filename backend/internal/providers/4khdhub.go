package providers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"streamheaven-backend/internal/utils"
)

// 4KHDHub — Go port of the legacy Node/edge scraper. 4KHDHub is a
// hubdrive/hubcloud file host that does NOT require cookies. It returns raw
// file-host URLs (hubdrive / pixeldrain / googleusercontent / .mp4/.mkv),
// which the registry's aggregation layer routes through /api/v/chunk as native
// MP4/MKV file streams — the playable source the ad-free/direct player needs.
//
// To keep ad-free loading fast, the FINAL resolved streaming links are cached
// (in-memory Map + disk file, 6h TTL) keyed by title, so a warm instance or any
// subsequent request skips the slow multi-step scrape/extraction entirely.

const (
	khDomainsURL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json"
	khUserAgent  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	khCacheTTL   = 6 * time.Hour
	khCacheDir   = ".cache/4khdhub"
)

var (
	khSuspicious = []string{
		"www-google-com.cdn.ampproject.org",
		"bloggingvector.shop",
		"cdn.ampproject.org",
		"hubcloud.cx/tg",
		"/tg/go",
	}

	khMovieCardRe = regexp.MustCompile(`(?is)<a\s+[^>]*class=["'][^"']*movie-card[^"']*["'][^>]*>([\s\S]*?)</a>`)
	khHrefRe      = regexp.MustCompile(`(?i)href=["']([^"']+)["']`)
	khH3Re        = regexp.MustCompile(`(?is)<h3[^>]*>([\s\S]*?)</h3>`)
	khMetaRe      = regexp.MustCompile(`(?i)movie-card-meta[^>]*>([\s\S]*?)<`)
	khBadgeRe   = regexp.MustCompile(`(?is)<span[^>]*class=["'][^"']*badge[^"']*["'][^>]*>([\s\S]*?)</span>`)
	khTitleRe   = regexp.MustCompile(`(?is)<h1[^>]*class=["'][^"']*page-title[^"']*["'][^>]*>([\s\S]*?)</h1>`)
	khLinkRe    = regexp.MustCompile(`(?is)<a[^>]+href=["']([^"']+)["'][^>]*>`)
	khRedirectRe  = regexp.MustCompile(`s\('o','([A-Za-z0-9+/=]+)'|ck\('_wp_http_\d+','([^']+)'`)
	khGamerLinkRe = regexp.MustCompile(`(?i)href=["'](https?://gamerxyt\.com/[^"']+)["']`)
	khPxLRe       = regexp.MustCompile(`(?i)pxl\s*=\s*["'](https?://[^"']+)["']`)
	khFileUrlRe   = regexp.MustCompile(`(?i)(https?://(?:[a-z0-9.-]+\.)?pixeldrain\.[a-z]+/[^\s"'<>]+)`)
	khSizeRe      = regexp.MustCompile(`(?is)<i\s+id="size"[^>]*>([^<]*)</`)
	khHeaderRe    = regexp.MustCompile(`(?is)<div[^>]*class=["'][^"']*card-header[^"']*["'][^>]*>([\s\S]*?)</div>`)
	khBtnRe       = regexp.MustCompile(`(?is)<a[^>]+class=["'][^"']*btn[^"']*["'][^>]+href=["'](https?://[^"']+)["']`)
	khQualityRe   = regexp.MustCompile(`(\d{3,4})[pP]`)
	khYearRe      = regexp.MustCompile(`(19|20)\d{2}`)
	// Series structure (current 4khdhub): each season is a div.season-item.episode-item
	// with .episode-number = "S05"; per-episode blocks .episode-download-item with
	// .badge-psa = "Episode-01" and hubcloud/hubdrive links inside .episode-links.
	khSeasonItemRe = regexp.MustCompile(`(?i)<div class["']?=?["']season-item episode-item`)
	khSeasonNumRe  = regexp.MustCompile(`(?i)<div class="episode-number">\s*S0*(\d+)`)
	khEpItemRe     = regexp.MustCompile(`(?i)<div class="episode-download-item">`)
	khEpNumRe      = regexp.MustCompile(`(?i)badge-psa">\s*Episode-0*(\d+)`)
	khEpLinkRe     = regexp.MustCompile(`(?i)<a[^>]+href=["'](https?://(?:hubdrive|hubcloud)\.[^"']+)["']`)
)

// ---- cache -------------------------------------------------------------

type khCacheEntry struct {
	Ts   int64       `json:"ts"`
	Data []khLinkObj `json:"data"`
}

type khLinkObj struct {
	Name     string `json:"name"`
	Title    string `json:"title"`
	URL      string `json:"url"`
	Quality  int    `json:"quality"`
	Provider string `json:"provider"`
}

type khCache struct {
	mu   sync.Mutex
	mem  map[string]khCacheEntry
	dir  string
	ttl  time.Duration
}

var khCacheInst = &khCache{mem: map[string]khCacheEntry{}, dir: khCacheDir, ttl: khCacheTTL}

func (c *khCache) safeKey(key string) string {
	var b strings.Builder
	for _, r := range key {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	return b.String()
}

func (c *khCache) get(key string) []khLinkObj {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now().UnixMilli()
	if e, ok := c.mem[key]; ok && now-e.Ts <= c.ttl.Milliseconds() {
		return e.Data
	}
	// disk
	f := filepath.Join(c.dir, c.safeKey(key)+".json")
	raw, err := os.ReadFile(f)
	if err == nil {
		var e khCacheEntry
		if json.Unmarshal(raw, &e) == nil && len(e.Data) > 0 && now-e.Ts <= c.ttl.Milliseconds() {
			c.mem[key] = e
			return e.Data
		}
		if len(e.Data) == 0 || now-e.Ts > c.ttl.Milliseconds() {
			_ = os.Remove(f)
		}
	}
	return nil
}

func (c *khCache) set(key string, data []khLinkObj) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now().UnixMilli()
	entry := khCacheEntry{Ts: now, Data: data}
	c.mem[key] = entry
	if len(c.mem) > 200 {
		for k, v := range c.mem {
			if now-v.Ts > c.ttl.Milliseconds() || len(c.mem) > 250 {
				delete(c.mem, k)
			}
		}
	}
	if len(data) == 0 {
		return
	}
	_ = os.MkdirAll(c.dir, 0o755)
	raw, err := json.Marshal(entry)
	if err == nil {
		_ = os.WriteFile(filepath.Join(c.dir, c.safeKey(key)+".json"), raw, 0o644)
	}
}

// ---- HTTP + helpers ----------------------------------------------------

func khBase64Decode(s string) string {
	if decoded, err := base64.StdEncoding.DecodeString(s); err == nil {
		return string(decoded)
	}
	if decoded, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return string(decoded)
	}
	return ""
}

func khRot13(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'A' && r <= 'Z':
			b.WriteRune(rune('A' + (r-'A'+13)%26))
		case r >= 'a' && r <= 'z':
			b.WriteRune(rune('a' + (r-'a'+13)%26))
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func khGetIndexQuality(s string) int {
	m := khQualityRe.FindStringSubmatch(s)
	if m != nil {
		if q, err := strconv.Atoi(m[1]); err == nil {
			return q
		}
	}
	return 2160
}

func khExtractYear(s string) int {
	m := khYearRe.FindString(s)
	if m != "" {
		if y, err := strconv.Atoi(m); err == nil {
			return y
		}
	}
	return 0
}

func khRemoveYear(s string) string {
	return khYearRe.ReplaceAllString(s, "")
}

func khNormalizeTitle(s string) string {
	var b strings.Builder
	lastSpace := false
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastSpace = false
		} else if !lastSpace {
			b.WriteByte(' ')
			lastSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func khContainsWords(title, query string) bool {
	qWords := strings.Fields(khNormalizeTitle(query))
	tNorm := khNormalizeTitle(title)
	for _, w := range qWords {
		if len(w) <= 3 {
			continue
		}
		if !strings.Contains(tNorm, w) {
			return false
		}
	}
	return true
}

func khSimilarity(a, b string) float64 {
	wa := strings.Fields(khNormalizeTitle(a))
	wb := strings.Fields(khNormalizeTitle(b))
	if len(wa) == 0 || len(wb) == 0 {
		return 0
	}
	set := map[string]bool{}
	for _, w := range wa {
		set[w] = true
	}
	overlap := 0.0
	for _, w := range wb {
		if set[w] {
			overlap++
		}
	}
	den := len(wa)
	if len(wb) > den {
		den = len(wb)
	}
	if den == 0 {
		return 0
	}
	return overlap / float64(den)
}

// ---- provider ----------------------------------------------------------

type KhdHubProvider struct {
	client     *http.Client
	tmdbAPIKey string
	mu         sync.Mutex
	domains    map[string]string
}

func NewKhdHubProvider(tmdbKey string) *KhdHubProvider {
	return &KhdHubProvider{
		client:     &http.Client{Timeout: 25 * time.Second},
		tmdbAPIKey: tmdbKey,
		domains:    map[string]string{},
	}
}

func (p *KhdHubProvider) Name() string { return "4khdhub" }

func (p *KhdHubProvider) httpGet(ctx context.Context, u string, allowJSON bool) (string, int, string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return "", 0, u, err
	}
	req.Header.Set("User-Agent", khUserAgent)
	if allowJSON {
		req.Header.Set("Accept", "application/json, */*")
	} else {
		req.Header.Set("Accept", "text/html,application/xhtml+xml")
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return "", 0, u, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return "", resp.StatusCode, u, err
	}
	return string(body), resp.StatusCode, resp.Request.URL.String(), nil
}

func (p *KhdHubProvider) getDomains(ctx context.Context) map[string]string {
	p.mu.Lock()
	if len(p.domains) > 0 {
		p.mu.Unlock()
		return p.domains
	}
	p.mu.Unlock()

	body, status, _, err := p.httpGet(ctx, khDomainsURL, true)
	if err != nil || status != 200 {
		return nil
	}
	var d map[string]string
	if json.Unmarshal([]byte(body), &d) != nil {
		return nil
	}
	p.mu.Lock()
	p.domains = d
	p.mu.Unlock()
	return d
}

type khSearchResult struct {
	Title string
	URL   string
	Year  int
	Score float64
}

func (p *KhdHubProvider) searchContent(ctx context.Context, baseURL, query string) []khSearchResult {
	var out []khSearchResult
	body, status, _, err := p.httpGet(ctx, fmt.Sprintf("%s/?s=%s", baseURL, url.QueryEscape(query)), false)
	if err != nil || status != 200 {
		return nil
	}
	if strings.Contains(body, "error code: 1106") {
		return nil
	}
	for _, cm := range khMovieCardRe.FindAllStringSubmatch(body, -1) {
		href := ""
		if hm := khHrefRe.FindStringSubmatch(cm[0]); hm != nil {
			href = hm[1]
		}
		if href == "" {
			continue
		}
		title := ""
		if h3 := khH3Re.FindStringSubmatch(cm[1]); h3 != nil {
			title = stripTags(h3[1])
		}
		if title == "" {
			continue
		}
		year := 0
		if mt := khMetaRe.FindStringSubmatch(cm[1]); mt != nil {
			year = khExtractYear(mt[1])
		}
		abs := href
		if !strings.HasPrefix(href, "http") {
			if strings.HasPrefix(href, "/") {
				abs = baseURL + href
			} else {
				abs = baseURL + "/" + href
			}
		}
		out = append(out, khSearchResult{Title: title, URL: abs, Year: year})
	}
	return out
}

func stripTags(s string) string {
	re := regexp.MustCompile(`(?s)<[^>]+>`)
	s = re.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}

func (p *KhdHubProvider) findBestMatch(results []khSearchResult, query string, tmdbYear int) *khSearchResult {
	var best *khSearchResult
	for i := range results {
		r := &results[i]
		score := khSimilarity(r.Title, query)
		if score > 0.5 && tmdbYear > 0 && r.Year > 0 && diff(r.Year, tmdbYear) <= 2 {
			r.Score = score
		}
		if r.Score < score {
			r.Score = score
		}
	}
	var sorted []khSearchResult
	for _, r := range results {
		if r.Score > 0.3 {
			sorted = append(sorted, r)
		}
	}
	// stable-ish sort by score desc (insertion)
	for i := 1; i < len(sorted); i++ {
		for j := i; j > 0 && sorted[j].Score > sorted[j-1].Score; j-- {
			sorted[j], sorted[j-1] = sorted[j-1], sorted[j]
		}
	}
	for _, r := range sorted {
		if khContainsWords(r.Title, query) {
			r := r
			return &r
		}
	}
	return best
}

func diff(a, b int) int {
	if a > b {
		return a - b
	}
	return b - a
}

type khEpisode struct {
	Season       int
	Episode      int
	DownloadLink string
}

type khContent struct {
	Title         string
	Year          int
	IsMovie       bool
	DownloadLinks []string
	Episodes      []khEpisode
}

func (p *KhdHubProvider) loadContent(ctx context.Context, contentURL string) *khContent {
	body, _, _, err := p.httpGet(ctx, contentURL, false)
	if err != nil {
		return &khContent{IsMovie: true}
	}
	// Movie vs Series: detect via the format badge spans on the content page
	// ("Movies" vs "Series"); fall back to presence of season/episode blocks.
	hasMovie, hasSeries := false, false
	for _, bm := range khBadgeRe.FindAllStringSubmatch(body, -1) {
		tag := stripTags(bm[1])
		if strings.Contains(tag, "Movies") {
			hasMovie = true
		} else if strings.Contains(tag, "Series") {
			hasSeries = true
		}
	}
	isMovie := hasSeries == false || hasMovie
	if hasMovie && hasSeries {
		isMovie = hasMovie
	}
	title := ""
	if tilt := khTitleRe.FindStringSubmatch(body); tilt != nil {
		title = strings.Split(stripTags(tilt[1]), "(")[0]
		title = strings.TrimSpace(title)
	}
	year := khExtractYear(body)

	// collecting download links
	seen := map[string]bool{}
	var links []string
	for _, m := range khLinkRe.FindAllStringSubmatch(body, -1) {
		href := m[1]
		lower := strings.ToLower(href)
		if (strings.Contains(lower, "hubdrive") || strings.Contains(lower, "hubcloud") || strings.Contains(lower, "drive")) &&
			strings.HasPrefix(lower, "http") && !seen[href] {
			seen[href] = true
			links = append(links, href)
		}
	}

	episodes := []khEpisode{}
	if !isMovie {
		episodes = parseSeriesEpisodes(body)
	}

	return &khContent{Title: title, Year: year, IsMovie: isMovie, DownloadLinks: links, Episodes: episodes}
}

// parseSeriesEpisodes extracts season/episode download links from the current
// 4khdhub series markup: each season is a div.season-item.episode-item with
// .episode-number = "S05"; inside are .episode-download-item blocks carrying a
// .badge-psa ("Episode-01") and hubcloud/hubdrive links in .episode-links.
func parseSeriesEpisodes(body string) []khEpisode {
	var episodes []khEpisode
	seen := map[string]bool{}

	seasonIdx := khSeasonItemRe.FindAllStringIndex(body, -1)
	for si := 0; si < len(seasonIdx); si++ {
		start := seasonIdx[si][0]
		end := len(body)
		if si+1 < len(seasonIdx) {
			end = seasonIdx[si+1][0]
		}
		seasonSlice := body[start:end]

		season := 0
		if m := khSeasonNumRe.FindStringSubmatch(seasonSlice); m != nil {
			season, _ = strconv.Atoi(m[1])
		}
		if season == 0 {
			continue
		}

		epIdx := khEpItemRe.FindAllStringIndex(seasonSlice, -1)
		for ei := 0; ei < len(epIdx); ei++ {
			estart := epIdx[ei][0]
			eend := len(seasonSlice)
			if ei+1 < len(epIdx) {
				eend = epIdx[ei+1][0]
			}
			epSlice := seasonSlice[estart:eend]

			ep := 0
			if m := khEpNumRe.FindStringSubmatch(epSlice); m != nil {
				ep, _ = strconv.Atoi(m[1])
			}
			if ep == 0 {
				continue
			}

			for _, lm := range khEpLinkRe.FindAllStringSubmatch(epSlice, -1) {
				href := lm[1]
				key := fmt.Sprintf("%d-%d-%s", season, ep, href)
				if !seen[key] {
					seen[key] = true
					episodes = append(episodes, khEpisode{Season: season, Episode: ep, DownloadLink: href})
				}
			}
		}
	}
	return episodes
}

// ---- redirect resolution -------------------------------------------------

func (p *KhdHubProvider) getRedirectLinks(ctx context.Context, redirectURL string) string {
	body, _, _, err := p.httpGet(ctx, redirectURL, false)
	if err != nil {
		return ""
	}
	var combined strings.Builder
	for _, m := range khRedirectRe.FindAllStringSubmatch(body, -1) {
		v := m[1]
		if v == "" {
			v = m[2]
		}
		if v != "" {
			combined.WriteString(v)
		}
	}
	if combined.Len() == 0 {
		return ""
	}
	decoded := khBase64Decode(khRot13(khBase64Decode(khBase64Decode(combined.String()))))
	var js struct {
		O       string `json:"o"`
		Data    string `json:"data"`
		BlogURL string `json:"blog_url"`
	}
	if json.Unmarshal([]byte(decoded), &js) != nil {
		return ""
	}
	encURL := strings.TrimSpace(khBase64Decode(js.O))
	data := strings.TrimSpace(khBase64Decode(js.Data))
	if encURL != "" {
		return encURL
	}
	if js.BlogURL != "" && data != "" {
		b, _, _, err := p.httpGet(ctx, js.BlogURL+"?re="+url.QueryEscape(data), false)
		if err == nil {
			return strings.TrimSpace(stripTags(b))
		}
	}
	return ""
}

// ---- extraction ----------------------------------------------------------

func khFilenameFromURL(u string) string {
	parsed, err := url.Parse(u)
	if err != nil {
		return ""
	}
	parts := strings.Split(parsed.Path, "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] != "" {
			if d, err := url.QueryUnescape(parts[i]); err == nil {
				return d
			}
			return parts[i]
		}
	}
	return ""
}

func (p *KhdHubProvider) extractHubDriveLinks(ctx context.Context, hostURL, referer string) []khLinkObj {
	body, _, _, err := p.httpGet(ctx, hostURL, false)
	if err != nil {
		return nil
	}
	size := ""
	if sm := khSizeRe.FindStringSubmatch(body); sm != nil {
		size = strings.TrimSpace(sm[1])
	}
	header := ""
	if hm := khHeaderRe.FindStringSubmatch(body); hm != nil {
		header = stripTags(hm[1])
	}
	if strings.Contains(strings.ToLower(header), "file not found") {
		return nil
	}
	quality := khGetIndexQuality(header)

	var href string
	for _, bm := range khBtnRe.FindAllStringSubmatch(body, -1) {
		href = bm[1]
		break
	}
	if href == "" {
		return nil
	}
	if strings.Contains(strings.ToLower(href), "hubcloud") {
		return nil
	}
	name := fmt.Sprintf("4KHDHub - HubDrive - %dp", quality)
	if quality == 0 {
		name = "4KHDHub - HubDrive"
	}
	filename := khFilenameFromURL(href)
	title := filename
	if title == "" {
		title = "Unknown"
	}
	if size != "" {
		title += "\n" + size
	}
	return []khLinkObj{{Name: name, Title: title, URL: href, Quality: quality, Provider: "4khdhub"}}
}

func (p *KhdHubProvider) resolveHubCloud(ctx context.Context, hostURL string) []khLinkObj {
	// Two-step: hubcloud drive page -> gamerxyt resolver page -> pixel/file links.
	target := hostURL
	if !strings.Contains(strings.ToLower(hostURL), "gamerxyt.com") {
		body, status, _, err := p.httpGet(ctx, hostURL, false)
		if err != nil || status != 200 {
			khLog("  hubcloud drive fetch failed status=%d err=%v", status, err)
			return nil
		}
		// Find the gamerxyt resolver href (carries host=hubcloud&id=..&token=..)
		gm := khGamerLinkRe.FindStringSubmatch(body)
		if gm == nil {
			khLog("  hubcloud drive page has no gamerxyt resolver link")
			return nil
		}
		target = gm[1]
	}
	khLog("  resolving hubcloud via gamerxyt: %s", target)

	respBody, status, _, err := p.httpGet(ctx, target, false)
	if err != nil || status != 200 {
		khLog("  gamerxyt fetch failed status=%d err=%v", status, err)
		return nil
	}

	var out []khLinkObj
	seen := map[string]bool{}
	add := func(u string) {
		if u == "" || seen[u] {
			return
		}
		// pixeldrain /u/<id> pages are HTML; the playable direct file is /api/file/<id>
		pm := regexp.MustCompile(`(?i)(pixeldrain\.(?:dev|net|com)/)u/([a-zA-Z0-9]+)`).FindStringSubmatch(u)
		if pm != nil {
			u = "https://" + pm[1] + "api/file/" + pm[2]
		}
		seen[u] = true
		quality := khGetIndexQuality(respBody)
		name := "4KHDHub - HubCloud"
		if quality > 0 {
			name = fmt.Sprintf("4KHDHub - HubCloud - %dp", quality)
		}
		out = append(out, khLinkObj{Name: name, Title: u, URL: u, Quality: quality, Provider: "4khdhub"})
	}

	// Prefer the JS-assigned pixel server URL
	if m := khPxLRe.FindStringSubmatch(respBody); m != nil {
		add(m[1])
	}
	// Then any pixeldrain links on the page
	for _, m := range khFileUrlRe.FindAllStringSubmatch(respBody, -1) {
		add(strings.TrimRight(m[1], `"`))
	}
	return out
}

func (p *KhdHubProvider) processExtractorLink(ctx context.Context, link string) []khLinkObj {
	if strings.Contains(strings.ToLower(link), "hubdrive") {
		khLog("  extractor: hubdrive for %s", link)
		if r := p.extractHubDriveLinks(ctx, link, "4KHDHub"); len(r) > 0 {
			return r
		}
		return nil
	}
	if strings.Contains(strings.ToLower(link), "hubcloud") {
		khLog("  extractor: hubcloud for %s", link)
		return p.resolveHubCloud(ctx, link)
	}
	quality := khGetIndexQuality(link)
	return []khLinkObj{{Name: "4KHDHub - HubDrive", Title: link, URL: link, Quality: quality, Provider: "4khdhub"}}
}

func (p *KhdHubProvider) extractStreamingLinks(ctx context.Context, downloadLinks []string) []khLinkObj {
	var out []khLinkObj
	for _, link := range downloadLinks {
		khLog("extractStreamingLinks: processing %s", link)
		resolved := link
		if strings.Contains(strings.ToLower(link), "id=") {
			r := p.getRedirectLinks(ctx, link)
			if r == "" {
				khLog("  redirect resolution returned empty")
				continue
			}
			resolved = r
			khLog("  resolved to %s", resolved)
		}
		items := p.processExtractorLink(ctx, resolved)
		khLog("  processExtractorLink -> %d items", len(items))
		for _, it := range items {
			if strings.HasSuffix(strings.ToLower(it.URL), ".zip") {
				continue
			}
			out = append(out, it)
		}
	}
	return out
}

// ---- main provider entry -------------------------------------------------

func khLog(format string, args ...interface{}) {
	if os.Getenv("KH_LOG") == "1" {
		fmt.Printf("[4KHDHub] "+format+"\n", args...)
	}
}

func (p *KhdHubProvider) GetStreams(ctx context.Context, req StreamRequest) ([]Stream, error) {
	khLog("GetStreams tmdb=%s type=%s", req.TmdbID, req.MediaType)
	kind := "movie"
	if req.MediaType == "series" || req.MediaType == "tv" {
		kind = "series"
	}
	tmdbType := "movie"
	if kind == "series" {
		tmdbType = "tv"
	}

	cacheKey := fmt.Sprintf("4khdhub_%s_%s", req.TmdbID, kind)
	if kind == "series" {
		cacheKey = fmt.Sprintf("4khdhub_%s_%s_s%de%d", req.TmdbID, kind, req.Season, req.Episode)
	}

	// 1. Cache hit — return instantly (skip slow scrape + extraction)
	if cached := khCacheInst.get(cacheKey); len(cached) > 0 {
		return khToStreams(cached), nil
	}

	meta, err := utils.GetTMDBMeta(ctx, tmdbType, req.TmdbID, p.tmdbAPIKey)
	if err != nil || meta.Title == "" {
		return nil, fmt.Errorf("4khdhub: failed to resolve tmdb title: %w", err)
	}
	title := meta.Title
	var tmdbYear int
	if y, err := strconv.Atoi(meta.Year); err == nil {
		tmdbYear = y
	}

	domains := p.getDomains(ctx)
	baseURL := ""
	if domains != nil {
		baseURL = domains["4khdhub"]
	}
	if baseURL == "" {
		return nil, fmt.Errorf("4khdhub: no base domain")
	}

	results := p.searchContent(ctx, baseURL, title)
	var best *khSearchResult
	khLog("searched title=%q got %d results", title, len(results))
	if len(results) > 0 {
		best = p.findBestMatch(results, title, tmdbYear)
	}
	if best == nil {
		khLog("best nil after primary; trying no-year query %q", khRemoveYear(title))
		noYear := khRemoveYear(title)
		if noYear != title {
			r2 := p.searchContent(ctx, baseURL, noYear)
			if len(r2) > 0 {
				if b2 := p.findBestMatch(r2, title, tmdbYear); b2 != nil {
					best = b2
				}
			}
		}
	}
	if best == nil || best.URL == "" {
		khLog("no best match")
		return nil, nil
	}
	khLog("best match: %q url=%s", best.Title, best.URL)

	content := p.loadContent(ctx, best.URL)
	khLog("content isMovie=%v links=%d episodes=%d", content.IsMovie, len(content.DownloadLinks), len(content.Episodes))
	if !content.IsMovie && (req.Season <= 0 || req.Episode <= 0) {
		return nil, nil
	}

	var downloadLinks []string
	if content.IsMovie {
		downloadLinks = content.DownloadLinks
	} else if len(content.Episodes) > 0 {
		for _, ep := range content.Episodes {
			if ep.Season == req.Season && ep.Episode == req.Episode {
				downloadLinks = append(downloadLinks, ep.DownloadLink)
			}
		}
	}
	if len(downloadLinks) == 0 {
		return nil, nil
	}

	linkObjs := p.extractStreamingLinks(ctx, downloadLinks)
	khLog("extracted %d link objects from %d download links", len(linkObjs), len(downloadLinks))
	if len(linkObjs) == 0 {
		return nil, nil
	}

	// Filter suspicious + dedupe + drop r2.dev
	var seen = map[string]bool{}
	var out []khLinkObj
	for _, l := range linkObjs {
		lower := strings.ToLower(l.URL)
		if containsAny(lower, khSuspicious) {
			continue
		}
		if seen[l.URL] {
			continue
		}
		seen[l.URL] = true
		if h := hostOf(l.URL); strings.HasSuffix(h, "r2.dev") {
			continue
		}
		out = append(out, l)
	}

	khCacheInst.set(cacheKey, out)
	return khToStreams(out), nil
}

func khToStreams(objs []khLinkObj) []Stream {
	streams := make([]Stream, 0, len(objs))
	for _, o := range objs {
		title := o.Title
		if title == "" {
			title = o.Name
		}
		q := fmt.Sprintf("%dp", o.Quality)
		if o.Quality <= 0 {
			q = "1080p"
		}
		streams = append(streams, Stream{
			Name:     o.Name,
			Title:    title,
			URL:      o.URL,
			Quality:  q,
			Provider: "4khdhub",
			Headers: map[string]string{
				"Referer":    "https://4khdhub.one/",
				"User-Agent": khUserAgent,
			},
		})
	}
	return streams
}

func hostOf(u string) string {
	parsed, err := url.Parse(u)
	if err != nil {
		return ""
	}
	return strings.ToLower(parsed.Hostname())
}

func containsAny(s string, subs []string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
