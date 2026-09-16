package proxy

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIsDownloaderRequest(t *testing.T) {
	tests := []struct {
		name      string
		userAgent string
		expected  bool
	}{
		{"IDM Standard", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Internet Download Manager 6.42", true},
		{"IDM Short", "IDM/6.41", true},
		{"1DM Android", "1DM/16.1", true},
		{"FDM", "FDM 6.18", true},
		{"JDownloader", "JDownloader 2.0", true},
		{"Aria2", "aria2/1.36.0", true},
		{"Wget", "Wget/1.21.3", true},
		{"Curl", "curl/8.4.0", true},
		{"yt-dlp", "yt-dlp/2024.03.10", true},
		{"VideoDownloadHelper", "Mozilla/5.0 VideoDownloadHelper/7.6.0", true},
		{"Chrome Browser", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", false},
		{"Firefox Browser", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0", false},
		{"Safari Mobile", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/ts-proxy?url=https://example.com/seg.ts", nil)
			req.Header.Set("User-Agent", tt.userAgent)
			if got := isDownloaderRequest(req); got != tt.expected {
				t.Errorf("isDownloaderRequest() for %q = %v, want %v", tt.userAgent, got, tt.expected)
			}
		})
	}
}

func TestIsAuthorizedOrigin(t *testing.T) {
	tests := []struct {
		name     string
		referer  string
		origin   string
		expected bool
	}{
		{"StreamHeaven Production Referer", "https://streamheaven.online/watch", "", true},
		{"StreamHeaven WWW Referer", "https://www.streamheaven.online/movie/123", "", true},
		{"Render Backend Referer", "https://steamheaven.onrender.com/", "", true},
		{"Localhost Dev", "http://localhost:3000/", "", true},
		{"Empty Referer & Origin (Mobile Native Video)", "", "", true},
		{"Unauthorized Scraper Site", "https://pirate-embeds.com/player", "", false},
		{"Foreign Origin", "", "https://unauthorized-site.xyz", false},
		{"Subdomain Spoofing Attack", "https://streamheaven.online.attacker.com/watch", "", false},
		{"Prefix Spoofing Attack", "https://evil-streamheaven.online/watch", "", false},
		{"Localhost Spoofing Attack", "https://localhost.attacker.com/", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/ts-proxy?url=https://example.com/seg.ts", nil)
			if tt.referer != "" {
				req.Header.Set("Referer", tt.referer)
			}
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if got := isAuthorizedOrigin(req); got != tt.expected {
				t.Errorf("isAuthorizedOrigin() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestMaskedDataEncoding(t *testing.T) {
	rawURL := "https://scalableimpactgroup.site/chunk_001.ts?token=123"
	encoded := EncodeData(rawURL)

	if strings.Contains(encoded, ".ts") {
		t.Errorf("EncodeData() output should not contain .ts extension: %s", encoded)
	}

	decoded := DecodeData(encoded)
	if decoded != rawURL {
		t.Errorf("DecodeData() = %q, want %q", decoded, rawURL)
	}

	// Test extractTargetURL with 'd' parameter
	reqMasked := httptest.NewRequest(http.MethodGet, "/api/v/chunk?d="+encoded, nil)
	if got := extractTargetURL(reqMasked); got != rawURL {
		t.Errorf("extractTargetURL with 'd' = %q, want %q", got, rawURL)
	}

	// Test backward compatibility with legacy 'url' parameter
	reqLegacy := httptest.NewRequest(http.MethodGet, "/ts-proxy?url="+rawURL, nil)
	if got := extractTargetURL(reqLegacy); got != rawURL {
		t.Errorf("extractTargetURL with legacy 'url' = %q, want %q", got, rawURL)
	}
}

func TestHakunaymatataBypass(t *testing.T) {
	targetURL := "https://bcdn.hakunaymatata.com/resource/h265/ac5979a336ffaf7286d0d71fc3e62e22.mp4?sign=3a3e472c5d3a795f7fd62de5631a0411&t=1788467589"
	req := httptest.NewRequest(http.MethodGet, targetURL, nil)
	customHeaders := map[string]string{
		"Referer": "https://vidlink.pro",
	}

	PrepareUpstreamRequest(req, targetURL, customHeaders)

	if !strings.Contains(req.Header.Get("User-Agent"), "AppleCoreMedia") {
		t.Errorf("expected User-Agent to contain AppleCoreMedia, got %q", req.Header.Get("User-Agent"))
	}
	if req.Header.Get("Referer") != "" {
		t.Errorf("expected Referer to be stripped, got %q", req.Header.Get("Referer"))
	}
}

func TestIsSafeURL(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		expected bool
	}{
		{"Loopback IPv4", "http://127.0.0.1/chunk.ts", false},
		{"Loopback Hostname", "http://localhost/chunk.ts", false},
		{"Private Network 10.x", "http://10.0.0.1/chunk.ts", false},
		{"Private Network 192.168.x", "http://192.168.1.50/video.mp4", false},
		{"Link Local Cloud Metadata", "http://169.254.169.254/latest/meta-data/", false},
		{"Invalid Scheme ftp", "ftp://example.com/file.mp4", false},
		{"Invalid Scheme file", "file:///etc/passwd", false},
		{"Empty Host", "http:///chunk.ts", false},
		{"Public Cloudflare DNS", "https://1.1.1.1/dns-query", true},
		{"Public Google DNS", "https://8.8.8.8/", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsSafeURL(tt.url)
			if got != tt.expected {
				t.Errorf("IsSafeURL(%q) = %v, want %v", tt.url, got, tt.expected)
			}
		})
	}

	// Verify Cache Hit on subsequent call
	t.Run("Safe Host Cache Hit", func(t *testing.T) {
		url := "https://1.1.1.1/test.ts"
		first := IsSafeURL(url)
		second := IsSafeURL(url)
		if first != second || !first {
			t.Errorf("Cache hit check failed: first=%v, second=%v", first, second)
		}
	})
}

