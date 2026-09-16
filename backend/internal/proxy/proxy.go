package proxy

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

var bufferPool = sync.Pool{
	New: func() interface{} {
		b := make([]byte, 32*1024) // 32KB buffer
		return &b
	},
}

var keyURIRegex = regexp.MustCompile(`URI="([^"]+)"`)

// EncodeData encodes a string into URL-safe base64 without padding to strip file extensions from URLs.
func EncodeData(raw string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

// DecodeData safely decodes URL-safe or standard base64 data.
func DecodeData(encoded string) string {
	if b, err := base64.RawURLEncoding.DecodeString(encoded); err == nil {
		return string(b)
	}
	if b, err := base64.URLEncoding.DecodeString(encoded); err == nil {
		return string(b)
	}
	if b, err := base64.StdEncoding.DecodeString(encoded); err == nil {
		return string(b)
	}
	return ""
}

// extractTargetURL retrieves the target URL from either the masked 'd' parameter or legacy 'url'.
func extractTargetURL(r *http.Request) string {
	if d := r.URL.Query().Get("d"); d != "" {
		if decoded := DecodeData(d); decoded != "" {
			return decoded
		}
	}
	return r.URL.Query().Get("url")
}

// extractHeaders retrieves custom headers either from masked 'h' parameter or legacy 'headers'.
func extractHeaders(r *http.Request) map[string]string {
	raw := ""
	if h := r.URL.Query().Get("h"); h != "" {
		raw = DecodeData(h)
	}
	if raw == "" {
		raw = r.URL.Query().Get("headers")
	}
	if raw == "" {
		return nil
	}
	var res map[string]string
	if err := json.Unmarshal([]byte(raw), &res); err == nil {
		return res
	}
	return nil
}

type safeHostEntry struct {
	safe      bool
	expiresAt time.Time
}

var (
	safeHostMu       sync.RWMutex
	safeHostCache    = make(map[string]safeHostEntry)
	safeHostTTL      = 10 * time.Minute
	maxSafeHostCache = 2000
)

func isIPBlocked(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

// IsSafeURL performs SSRF checks to prevent access to private/loopback/cloud-metadata addresses.
// Employs a thread-safe TTL cache so streaming media chunks from the same CDN do not hammer DNS.
func IsSafeURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}

	host := strings.ToLower(u.Hostname())
	if host == "" {
		return false
	}

	// 1. Fast O(1) in-memory cache check
	safeHostMu.RLock()
	if entry, ok := safeHostCache[host]; ok {
		if time.Now().Before(entry.expiresAt) {
			safeHostMu.RUnlock()
			return entry.safe
		}
	}
	safeHostMu.RUnlock()

	// 2. Direct IP evaluation (no DNS needed if host is an IP literal)
	var safe bool
	if ip := net.ParseIP(host); ip != nil {
		safe = !isIPBlocked(ip)
	} else {
		ips, lookupErr := net.LookupIP(host)
		if lookupErr != nil || len(ips) == 0 {
			safe = false
		} else {
			safe = true
			for _, ip := range ips {
				if isIPBlocked(ip) {
					safe = false
					break
				}
			}
		}
	}

	// 3. Store result with TTL and bound cache capacity
	safeHostMu.Lock()
	if len(safeHostCache) >= maxSafeHostCache {
		now := time.Now()
		for k, v := range safeHostCache {
			if now.After(v.expiresAt) {
				delete(safeHostCache, k)
			}
		}
		if len(safeHostCache) >= maxSafeHostCache {
			// Prune first item encountered
			for k := range safeHostCache {
				delete(safeHostCache, k)
				break
			}
		}
	}
	safeHostCache[host] = safeHostEntry{
		safe:      safe,
		expiresAt: time.Now().Add(safeHostTTL),
	}
	safeHostMu.Unlock()

	return safe
}

// ProxyHandler encapsulates proxying logic and HTTP client configuration.
type ProxyHandler struct {
	client          *http.Client // For small metadata/manifest fetches (with timeout)
	streamingClient *http.Client // For long-lived media chunks (no timeout, tuned connection pooling)
}

func NewProxyHandler() *ProxyHandler {
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		DialContext:           dialer.DialContext,
		MaxIdleConns:          500,
		MaxIdleConnsPerHost:   100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 20 * time.Second,
		DisableCompression:    true, // Prevent gzip overhead on media files
	}

	checkRedirect := func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return fmt.Errorf("too many redirects")
		}
		if !IsSafeURL(req.URL.String()) {
			return fmt.Errorf("redirect to blocked host")
		}
		return nil
	}

	return &ProxyHandler{
		client: &http.Client{
			Transport:     transport,
			Timeout:       15 * time.Second,
			CheckRedirect: checkRedirect,
		},
		streamingClient: &http.Client{
			Transport:     transport,
			Timeout:       0, // Zero timeout for continuous media streaming; controlled by r.Context()
			CheckRedirect: checkRedirect,
		},
	}
}

// isDownloaderRequest checks for User-Agents of video grabbers and download managers.
func isDownloaderRequest(r *http.Request) bool {
	ua := strings.ToLower(r.Header.Get("User-Agent"))
	downloaderSignatures := []string{
		"internet download manager",
		"idm",
		"1dm",
		"fdm",
		"freedownloadmanager",
		"jdownloader",
		"aria2",
		"wget",
		"curl",
		"python-urllib",
		"python-requests",
		"aiohttp",
		"httpx",
		"go-http-client",
		"youtube-dl",
		"yt-dlp",
		"videodownloadhelper",
	}
	for _, sig := range downloaderSignatures {
		if strings.Contains(ua, sig) {
			return true
		}
	}
	return false
}

// matchHost checks if the hostname of rawURL matches or is a subdomain of an allowed host.
func matchHost(rawURL string, allowedHosts []string) bool {
	if rawURL == "" {
		return false
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	h := strings.ToLower(u.Hostname())
	if h == "" {
		return false
	}
	for _, allowed := range allowedHosts {
		if h == allowed || strings.HasSuffix(h, "."+allowed) {
			return true
		}
	}
	return false
}

// isAuthorizedOrigin checks if Referer or Origin is from an allowed domain or local dev.
func isAuthorizedOrigin(r *http.Request) bool {
	referer := r.Header.Get("Referer")
	origin := r.Header.Get("Origin")

	// If neither header is present, allow (standard for mobile native video elements)
	if referer == "" && origin == "" {
		return true
	}

	allowedHosts := []string{
		"cinecub.stream",
		"www.cinecub.stream",
		"streamheaven.online",
		"steamheaven.onrender.com",
		"cinecub.sampadchakma22.workers.dev",
		"streamheaven-edge.sampadchakma22.workers.dev",
		"localhost",
		"127.0.0.1",
	}

	if referer != "" && matchHost(referer, allowedHosts) {
		return true
	}
	if origin != "" && matchHost(origin, allowedHosts) {
		return true
	}
	return false
}

// PrepareUpstreamRequest sets default headers, forwards custom headers, and applies host-specific anti-blocking bypasses.
func PrepareUpstreamRequest(req *http.Request, targetURL string, customHeaders map[string]string) {
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	if customHeaders != nil {
		for k, v := range customHeaders {
			kLower := strings.ToLower(k)
			if kLower != "host" && kLower != "connection" {
				req.Header.Set(k, v)
			}
		}
	}

	// Host-specific bypasses for streaming CDNs
	targetLower := strings.ToLower(targetURL)
	if strings.Contains(targetLower, "hakunaymatata.com") {
		// bcdn.hakunaymatata.com blocks requests with Referer: https://vidlink.pro (429) and standard Chrome UA (428).
		// Emulating AppleCoreMedia with no Referer allows seamless media streaming (HTTP 206 Partial Content).
		req.Header.Set("User-Agent", "AppleCoreMedia/1.0.0.20G75 (iPad; U; CPU OS 16_6 like Mac OS X; en_us)")
		req.Header.Del("Referer")
		req.Header.Del("Origin")
	}
}

// HandleTSProxy proxies media segments (.ts, .mkv, .mp4) with zero-allocation byte streaming and masked URL support.
func (p *ProxyHandler) HandleTSProxy(w http.ResponseWriter, r *http.Request) {
	if isDownloaderRequest(r) {
		http.Error(w, `{"error":"DOWNLOAD_MANAGER_FORBIDDEN"}`, http.StatusForbidden)
		return
	}
	if !isAuthorizedOrigin(r) {
		http.Error(w, `{"error":"UNAUTHORIZED_ORIGIN"}`, http.StatusForbidden)
		return
	}

	targetURL := extractTargetURL(r)
	if targetURL == "" || !IsSafeURL(targetURL) {
		http.Error(w, `{"error":"TARGET_NOT_ALLOWED"}`, http.StatusBadRequest)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", targetURL, nil)
	if err != nil {
		http.Error(w, `{"error":"REQUEST_CREATION_FAILED"}`, http.StatusInternalServerError)
		return
	}

	PrepareUpstreamRequest(req, targetURL, extractHeaders(r))

	// Forward client Range header for chunk streaming and video seeking
	if clientRange := r.Header.Get("Range"); clientRange != "" {
		req.Header.Set("Range", clientRange)
	}

	// Clear write deadline for streaming responses so long-running media playback is never cut off
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	resp, err := p.streamingClient.Do(req)
	if err != nil {
		http.Error(w, `{"error":"UPSTREAM_FETCH_FAILED"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Forward response headers with anti-sniffing protections
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "inline")

	// Obfuscate .ts chunks as application/octet-stream so IDM/downloaders do not trigger
	targetLower := strings.ToLower(targetURL)
	upstreamCT := strings.ToLower(resp.Header.Get("Content-Type"))
	if strings.Contains(targetLower, ".ts") || strings.Contains(upstreamCT, "video/mp2t") || strings.Contains(upstreamCT, "text/plain") {
		w.Header().Set("Content-Type", "application/octet-stream")
	} else if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	if cr := resp.Header.Get("Content-Range"); cr != "" {
		w.Header().Set("Content-Range", cr)
	}

	w.WriteHeader(resp.StatusCode)

	bufPtr := bufferPool.Get().(*[]byte)
	defer bufferPool.Put(bufPtr)

	_, _ = io.CopyBuffer(w, resp.Body, *bufPtr)
}

// HandleM3U8Proxy proxies and rewrites HLS manifest files so all chunks route through the proxy using masked paths.
func (p *ProxyHandler) HandleM3U8Proxy(w http.ResponseWriter, r *http.Request) {
	if isDownloaderRequest(r) {
		http.Error(w, `{"error":"DOWNLOAD_MANAGER_FORBIDDEN"}`, http.StatusForbidden)
		return
	}
	if !isAuthorizedOrigin(r) {
		http.Error(w, `{"error":"UNAUTHORIZED_ORIGIN"}`, http.StatusForbidden)
		return
	}

	targetURL := extractTargetURL(r)
	if targetURL == "" || !IsSafeURL(targetURL) {
		http.Error(w, `{"error":"TARGET_NOT_ALLOWED"}`, http.StatusBadRequest)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", targetURL, nil)
	if err != nil {
		http.Error(w, `{"error":"REQUEST_CREATION_FAILED"}`, http.StatusInternalServerError)
		return
	}

	customHeaders := extractHeaders(r)
	var rawHeadersJSON string
	if customHeaders != nil {
		if hb, err := json.Marshal(customHeaders); err == nil {
			rawHeadersJSON = string(hb)
		}
	}
	PrepareUpstreamRequest(req, targetURL, customHeaders)

	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"M3U8_FETCH_FAILED"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		http.Error(w, fmt.Sprintf(`{"error":"M3U8 fetch failed: %d"}`, resp.StatusCode), resp.StatusCode)
		return
	}

	baseURL, _ := url.Parse(targetURL)
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	serverHost := r.Host
	proxyBase := fmt.Sprintf("%s://%s", scheme, serverHost)

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "inline")

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "#") {
			// Check for encrypted keys (#EXT-X-KEY) or segment maps (#EXT-X-MAP)
			if strings.HasPrefix(trimmed, "#EXT-X-KEY:") || strings.HasPrefix(trimmed, "#EXT-X-MAP:") {
				line = keyURIRegex.ReplaceAllStringFunc(line, func(match string) string {
					submatch := keyURIRegex.FindStringSubmatch(match)
					if len(submatch) > 1 {
						keyURL := resolveURL(baseURL, submatch[1])
						proxiedKey := fmt.Sprintf("%s/api/v/chunk?d=%s", proxyBase, EncodeData(keyURL))
						if rawHeadersJSON != "" {
							proxiedKey += "&h=" + EncodeData(rawHeadersJSON)
						}
						return fmt.Sprintf(`URI="%s"`, proxiedKey)
					}
					return match
				})
			}
			_, _ = fmt.Fprintln(w, line)
		} else if trimmed != "" {
			// Segment or sub-playlist URL masked with NO file extensions to blind IDM
			resolved := resolveURL(baseURL, trimmed)
			var proxiedURL string
			if strings.Contains(resolved, ".m3u8") {
				proxiedURL = fmt.Sprintf("%s/api/v/manifest?d=%s", proxyBase, EncodeData(resolved))
			} else {
				proxiedURL = fmt.Sprintf("%s/api/v/chunk?d=%s", proxyBase, EncodeData(resolved))
			}
			if rawHeadersJSON != "" {
				proxiedURL += "&h=" + EncodeData(rawHeadersJSON)
			}
			_, _ = fmt.Fprintln(w, proxiedURL)
		} else {
			_, _ = fmt.Fprintln(w, "")
		}
	}
}

func resolveURL(base *url.URL, target string) string {
	u, err := url.Parse(target)
	if err != nil {
		return target
	}
	if base == nil {
		return u.String()
	}
	return base.ResolveReference(u).String()
}
