package subtitles

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Client wraps the SubDL subtitle API. The API key stays server-side so it is
// never exposed to the browser; the storefront only talks to our own endpoints.
type Client struct {
	apiKey string
	http   *http.Client
}

const (
	searchBase   = "https://api.subdl.com/api/v1/subtitles"
	downloadBase = "https://dl.subdl.com/subtitle/"
)

// Entry is one downloadable subtitle file, normalized for the frontend.
type Entry struct {
	Ref  string `json:"ref"`  // "{n_id}/{file_n_id}" token used by /api/subtitles/download
	Name string `json:"name"` // human-readable release/file name
	Lang string `json:"lang"` // e.g. "EN"
	Hi   bool   `json:"hi"`   // hearing-impaired
	Ext  string `json:"ext"`  // "srt", "vtt", "ass" ...
	Size int64  `json:"size,omitempty"`
}

// Result is the normalized response for /api/subtitles.
type Result struct {
	Found   bool    `json:"found"`
	Count   int     `json:"count"`
	Entries []Entry `json:"entries"`
}

// ErrNotConfigured is returned by Search/Download when the server has no
// SubDL API key set; callers map it to 503 so it is not mistaken for an
// upstream failure.
var ErrNotConfigured = errors.New("SUBDL_API_KEY not configured")

// New creates a Client. If apiKey is empty the client is still usable for
// construction but Search/Download will refuse with ErrNotConfigured.
func New(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 12 * time.Second},
	}
}

// Search queries SubDL by TMDB id and returns matching subtitle files. For TV
// shows it narrows to the requested season/episode. mediaType accepts "movie",
// "tv", or "series" (normalized to "tv").
func (c *Client) Search(ctx context.Context, tmdbID, mediaType string, season, episode int, lang string) (*Result, error) {
	if c.apiKey == "" {
		return nil, ErrNotConfigured
	}
	if mediaType == "series" {
		mediaType = "tv"
	}
	if mediaType != "movie" && mediaType != "tv" {
		return nil, fmt.Errorf("unsupported media type: %s", mediaType)
	}
	if lang == "" {
		lang = "EN"
	}
	lang = strings.ToUpper(strings.TrimSpace(lang))

	q := url.Values{}
	q.Set("api_key", c.apiKey)
	q.Set("tmdb_id", tmdbID)
	q.Set("type", mediaType)
	q.Set("languages", lang)
	q.Set("unpack", "1")
	if mediaType == "tv" {
		if season > 0 {
			q.Set("season_number", fmt.Sprintf("%d", season))
		}
		if episode > 0 {
			q.Set("episode_number", fmt.Sprintf("%d", episode))
		}
	}

	req, err := http.NewRequestWithContext(ctx, "GET", searchBase+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "StreamHeaven-Go/1.0 subtitles")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// SubDL returns 200 with {"status":false,...} on failure and non-2xx on auth errors.
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("subdl search returned %d", resp.StatusCode)
	}

	var payload struct {
		Status    bool `json:"status"`
		Subtitles []struct {
			URL         string `json:"url"`
			Name        string `json:"name"`
			Language    string `json:"language"`
			HI          bool   `json:"hi"`
			Format      string `json:"format"`
			Season      int    `json:"season"`
			Episode     int    `json:"episode"`
			EpisodeFrom int    `json:"episode_from"`
			EpisodeEnd  int    `json:"episode_end"`
			FullSeason  bool   `json:"full_season"`
			Size        int64  `json:"size"`
			UnpackFiles []struct {
				FileNID  string `json:"file_n_id"`
				Name     string `json:"name"`
				Language string `json:"language"`
				HI       bool   `json:"hi"`
				Format   string `json:"format"`
				Season   int    `json:"season"`
				Episode  int    `json:"episode"`
				Size     int64  `json:"size"`
				URL      string `json:"url"`
			} `json:"unpack_files"`
		} `json:"subtitles"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&payload); err != nil {
		return nil, err
	}
	if !payload.Status {
		return nil, fmt.Errorf("subdl search failed")
	}

	res := &Result{}
	seen := map[string]bool{}
	for _, sub := range payload.Subtitles {
		// Prefer per-episode unpacked files; fall back to the packed file url.
		if len(sub.UnpackFiles) > 0 {
			for _, f := range sub.UnpackFiles {
				ref, ok := fileRefFromURL(f.URL)
				if !ok || seen[ref] {
					continue
				}
				// Skip episodes outside the requested range when provided.
				if mediaType == "tv" && episode > 0 && f.Episode > 0 && f.Episode != episode {
					continue
				}
				if mediaType == "tv" && season > 0 && f.Season > 0 && f.Season != season {
					continue
				}
				name := f.Name
				if name == "" {
					name = sub.Name
				}
				seen[ref] = true
				res.Entries = append(res.Entries, Entry{
					Ref:  ref,
					Name: name,
					Lang: strings.ToUpper(f.Language),
					Hi:   f.HI,
					Ext:  cleanExt(f.Format),
					Size: f.Size,
				})
			}
			continue
		}
		ref, ok := fileRefFromURL(sub.URL)
		if !ok {
			continue
		}
		if mediaType == "tv" && episode > 0 && sub.Episode > 0 && sub.Episode != episode {
			continue
		}
		if mediaType == "tv" && season > 0 && sub.Season > 0 && sub.Season != season {
			continue
		}
		seen[ref] = true
		res.Entries = append(res.Entries, Entry{
			Ref:  ref,
			Name: sub.Name,
			Lang: strings.ToUpper(sub.Language),
			Hi:   sub.HI,
			Ext:  cleanExt(sub.Format),
			Size: sub.Size,
		})
	}

	res.Count = len(res.Entries)
	res.Found = res.Count > 0
	return res, nil
}

// Download fetches a subtitle file from SubDL by reference token and returns
// its bytes. A reference is either the unpacked "{n_id}/{file_n_id}" form
// (direct raw file) or the packed "{n_id}.zip" form (a zip that is unpacked
// and the first subtitle file returned). The token is strictly validated so
// only content under dl.subdl.com can be fetched (SSRF-safe) and it proxies
// through the configured x-api-key.
func (c *Client) Download(ctx context.Context, ref string) ([]byte, string, error) {
	if !validRef(ref) {
		return nil, "", fmt.Errorf("invalid subtitle ref")
	}
	if c.apiKey == "" {
		return nil, "", ErrNotConfigured
	}

	u := downloadBase + ref
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("User-Agent", "StreamHeaven-Go/1.0 subtitles")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("subdl download returned %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, "", err
	}

	// Packed zip: unpack and return the first usable subtitle file.
	if strings.HasSuffix(strings.ToLower(ref), ".zip") {
		return extractFromZip(data)
	}
	return data, extFromName(resp.Header.Get("Content-Disposition"), data), nil
}

// refRe matches both the unpacked "{n_id}/{file_n_id}" form and the packed
// single-segment "{n_id}.zip" form. Characters are limited to unicode-word,
// dash, dot and a single optional slash separator so arbitrary SSRF-free refs
// are impossible.
var refRe = regexp.MustCompile(`^[A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-]+)?(?:\.[A-Za-z0-9]{2,4})?$`)

func validRef(ref string) bool {
	return refRe.MatchString(ref)
}

// fileRefFromURL extracts a usable ref from a SubDL download url. It accepts
// the direct per-file "/subtitle/{n_id}/{file_n_id}" form as well as the
// packed "/subtitle/{n_id}.zip" form. Any query parameters (e.g. ?api_key=...)
// appended by SubDL are stripped before extracting the path.
func fileRefFromURL(u string) (string, bool) {
	u = strings.TrimSpace(u)
	// SubDL appends ?api_key=... to download URLs; strip it.
	if i := strings.IndexByte(u, '?'); i >= 0 {
		u = u[:i]
	}
	if strings.HasPrefix(u, downloadBase) {
		u = strings.TrimPrefix(u, downloadBase)
	} else {
		u = strings.TrimPrefix(u, "/subtitle/")
	}
	u = strings.Trim(u, "/")
	if u == "" {
		return "", false
	}
	if !validRef(u) {
		return "", false
	}
	return u, true
}

// extractFromZip unpacks a downloaded SubDL zip and returns the contents of
// the first subtitle file it finds (SRT/VTT/ASS/SSA/SUB/TXT). Decompressed
// output is capped to avoid unbounded memory use.
func extractFromZip(data []byte) ([]byte, string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, "", fmt.Errorf("not a valid zip: %w", err)
	}
	const maxExtract = 16 << 20
	for _, f := range zr.File {
		ext := strings.ToLower(filepathExt(f.Name))
		if !isSubtitleExt(ext) || f.FileInfo().IsDir() {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		body, rerr := io.ReadAll(io.LimitReader(rc, maxExtract))
		rc.Close()
		if rerr != nil {
			return nil, "", rerr
		}
		return body, strings.TrimPrefix(ext, "."), nil
	}
	return nil, "", fmt.Errorf("no subtitle file found in pack")
}

func filepathExt(name string) string {
	if i := strings.LastIndexByte(name, '.'); i >= 0 {
		return name[i:]
	}
	return ""
}

func isSubtitleExt(ext string) bool {
	switch ext {
	case ".srt", ".vtt", ".ass", ".ssa", ".sub":
		return true
	}
	return false
}

func cleanExt(format string) string {
	e := strings.ToLower(strings.TrimSpace(format))
	e = strings.TrimPrefix(e, ".")
	if e == "" {
		return "srt"
	}
	return e
}

func extFromName(contentDisposition string, data []byte) string {
	if cd := strings.ToLower(contentDisposition); cd != "" {
		if i := strings.Index(cd, "."); i >= 0 {
			tail := cd[i:]
			for _, ext := range []string{".srt", ".vtt", ".ass", ".ssa", ".sub", ".txt"} {
				if strings.Contains(tail, ext) {
					return strings.TrimPrefix(ext, ".")
				}
			}
		}
	}
	return sniffExt(data)
}

func sniffExt(data []byte) string {
	s := strings.TrimSpace(string(data))
	if len(s) >= 6 && strings.EqualFold(strings.TrimSpace(s[:6]), "WEBVTT") {
		return "vtt"
	}
	if strings.Contains(s, "Dialogue:") {
		return "ass"
	}
	return "srt"
}

// SRTToVTT converts SRT subtitle content to WebVTT. If the input already looks
// like WebVTT it is returned unchanged.
func SRTToVTT(data []byte) []byte {
	s := strings.TrimPrefix(string(data), "\uFEFF") // strip UTF-8 BOM
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")

	// Already WebVTT: normalize and pass through.
	if len(s) >= 6 && strings.EqualFold(strings.TrimSpace(s[:6]), "WEBVTT") {
		return []byte(s)
	}

	var out strings.Builder
	out.WriteString("WEBVTT\n\n")

	blocks := strings.Split(strings.TrimSpace(s), "\n\n")
	for _, block := range blocks {
		lines := strings.Split(strings.TrimSpace(block), "\n")
		if len(lines) == 0 {
			continue
		}
		// Drop a numeric cue index line if present before the timestamp line.
		if isNumeric(strings.TrimSpace(lines[0])) && len(lines) > 1 && strings.Contains(lines[1], "-->") {
			lines = lines[1:]
		}
		for _, line := range lines {
			// SRT uses commas in timestamps; WebVTT uses dots.
			if strings.Contains(line, "-->") {
				line = strings.ReplaceAll(line, ",", ".")
			}
			out.WriteString(line)
			out.WriteString("\n")
		}
		out.WriteString("\n")
	}
	return []byte(out.String())
}

var numericRe = regexp.MustCompile(`^[0-9]+$`)

func isNumeric(s string) bool {
	return numericRe.MatchString(s)
}
