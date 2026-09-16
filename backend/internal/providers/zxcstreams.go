package providers

import (
	"bytes"
	"context"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

const (
	zxcSalt        = "3435443433"
	zxcInitialBase = "https://r1.zxcstream.xyz"
	zxcUserAgent   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
)

var zxcServers = []string{"icarus", "berkas", "orion", "athena"}

type ZXCStreamsProvider struct {
	client *http.Client
}

func NewZXCStreamsProvider() *ZXCStreamsProvider {
	return &ZXCStreamsProvider{
		client: &http.Client{Timeout: 8 * time.Second},
	}
}

func (p *ZXCStreamsProvider) Name() string {
	return "ZXCStreams"
}

func sha512Hex(data string) string {
	h := sha512.Sum512([]byte(data))
	return hex.EncodeToString(h[:])
}

func (p *ZXCStreamsProvider) GetStreams(ctx context.Context, req StreamRequest) ([]Stream, error) {
	nowMs := time.Now().UnixNano() / int64(time.Millisecond)
	hashInput := fmt.Sprintf("%d:%s:%s", nowMs, zxcSalt, req.TmdbID)
	xt := sha512Hex(hashInput)[:64]

	tokenPayload := map[string]interface{}{
		"rgrwsdsdfgwrwrwwr":      req.TmdbID,
		"xfgdfgdsffgrwgrwyjhkjt": xt,
		"rdghhdghhfssft":         nowMs,
	}
	bodyJSON, _ := json.Marshal(tokenPayload)

	tokenReq, err := http.NewRequestWithContext(ctx, "POST", zxcInitialBase+"/backend/token", bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	tokenReq.Header.Set("User-Agent", zxcUserAgent)
	tokenReq.Header.Set("Content-Type", "application/json")
	tokenReq.Header.Set("Origin", zxcInitialBase)
	tokenReq.Header.Set("Referer", fmt.Sprintf("%s/player/movie/%s", zxcInitialBase, req.TmdbID))

	tokenResp, err := p.client.Do(tokenReq)
	if err != nil {
		return nil, err
	}
	defer tokenResp.Body.Close()

	if tokenResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("zxc token status: %d", tokenResp.StatusCode)
	}

	var tokenData map[string]interface{}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil {
		return nil, err
	}

	tokenVal, ok := tokenData["ZDDVHJFGHYRHG"].(string)
	if !ok || tokenVal == "" {
		return nil, fmt.Errorf("zxc token missing")
	}

	var streams []Stream
	mType := req.MediaType
	if mType == "series" {
		mType = "tv"
	}

	for _, srv := range zxcServers {
		streamPayload := map[string]interface{}{
			"id":     req.TmdbID,
			"type":   mType,
			"server": srv,
			"token":  tokenVal,
		}
		if mType == "tv" {
			streamPayload["season"] = strconv.Itoa(req.Season)
			streamPayload["episode"] = strconv.Itoa(req.Episode)
		}

		sBody, _ := json.Marshal(streamPayload)
		sReq, err := http.NewRequestWithContext(ctx, "POST", zxcInitialBase+"/backend/stream", bytes.NewReader(sBody))
		if err != nil {
			continue
		}
		sReq.Header.Set("User-Agent", zxcUserAgent)
		sReq.Header.Set("Content-Type", "application/json")
		sReq.Header.Set("Origin", zxcInitialBase)
		sReq.Header.Set("Referer", fmt.Sprintf("%s/player/%s/%s", zxcInitialBase, mType, req.TmdbID))

		sResp, err := p.client.Do(sReq)
		if err != nil || sResp.StatusCode != http.StatusOK {
			continue
		}

		var sData struct {
			URL    string `json:"url"`
			Stream string `json:"stream"`
		}
		_ = json.NewDecoder(sResp.Body).Decode(&sData)
		sResp.Body.Close()

		streamURL := sData.URL
		if streamURL == "" {
			streamURL = sData.Stream
		}

		if streamURL != "" {
			streams = append(streams, Stream{
				Name:     fmt.Sprintf("ZXCStreams (%s)", srv),
				Title:    fmt.Sprintf("ZXCStreams - %s", srv),
				URL:      streamURL,
				Quality:  "Auto",
				Provider: "ZXCStreams",
				Headers: map[string]string{
					"User-Agent": zxcUserAgent,
					"Referer":    zxcInitialBase + "/",
					"Origin":     zxcInitialBase,
				},
			})
			break // Return highest priority working server
		}
	}

	return streams, nil
}
