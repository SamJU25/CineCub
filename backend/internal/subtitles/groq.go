package subtitles

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os/exec"
	"sync"
	"time"
)

const (
	groqTranscribeURL = "https://api.groq.com/openai/v1/audio/transcriptions"
	defaultModel      = "whisper-large-v3"
	maxAudioBytes     = 24 * 1024 * 1024 // 24 MB safety margin for Groq 25 MB limit
)

// GroqWhisperClient wraps Groq's high-speed Whisper Large-v3 audio transcription endpoint.
type GroqWhisperClient struct {
	apiKey     string
	apiURL     string
	httpClient *http.Client
	cache      sync.Map // cacheKey -> string (WebVTT content)
}

// NewGroqClient initializes a Groq Whisper client.
func NewGroqClient(apiKey string) *GroqWhisperClient {
	return &GroqWhisperClient{
		apiKey: apiKey,
		apiURL: groqTranscribeURL,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// SetBaseURL allows overriding the transcription endpoint (useful for tests or local FreeLLMAPI).
func (g *GroqWhisperClient) SetBaseURL(url string) {
	if url != "" {
		g.apiURL = url
	}
}

// IsConfigured checks if a valid Groq API key is present.
func (g *GroqWhisperClient) IsConfigured() bool {
	return g != nil && g.apiKey != ""
}

// GetCached returns a previously generated WebVTT subtitle if present.
func (g *GroqWhisperClient) GetCached(cacheKey string) (string, bool) {
	if cacheKey == "" {
		return "", false
	}
	if val, ok := g.cache.Load(cacheKey); ok {
		if vtt, ok := val.(string); ok && vtt != "" {
			return vtt, true
		}
	}
	return "", false
}

// SetCached stores a WebVTT subtitle in the memory cache.
func (g *GroqWhisperClient) SetCached(cacheKey string, vtt string) {
	if cacheKey != "" && vtt != "" {
		g.cache.Store(cacheKey, vtt)
	}
}

// Transcribe sends raw audio to Groq Whisper and returns WebVTT subtitles.
func (g *GroqWhisperClient) Transcribe(ctx context.Context, audioReader io.Reader, filename string, language string) (string, error) {
	if !g.IsConfigured() {
		return "", errors.New("GROQ_API_KEY not configured")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Set model to whisper-large-v3
	if err := writer.WriteField("model", defaultModel); err != nil {
		return "", fmt.Errorf("failed to write model field: %w", err)
	}

	// Request WebVTT format directly from Whisper
	if err := writer.WriteField("response_format", "vtt"); err != nil {
		return "", fmt.Errorf("failed to write response_format field: %w", err)
	}

	// Optional language hint (e.g. "en")
	if language != "" {
		if err := writer.WriteField("language", language); err != nil {
			return "", fmt.Errorf("failed to write language field: %w", err)
		}
	}

	if filename == "" {
		filename = "audio.mp3"
	}

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %w", err)
	}

	// Stream audio into form part with 24MB cap
	written, err := io.Copy(part, io.LimitReader(audioReader, maxAudioBytes))
	if err != nil {
		return "", fmt.Errorf("failed to copy audio data: %w", err)
	}
	if written == 0 {
		return "", errors.New("audio data is empty")
	}

	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("failed to close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.apiURL, body)
	if err != nil {
		return "", fmt.Errorf("failed to create Groq request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+g.apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Groq request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read Groq response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("Groq error (HTTP %d): %s", resp.StatusCode, string(respBytes))
	}

	vtt := string(respBytes)
	return vtt, nil
}

// ExtractAudioAndTranscribe extracts audio from a media stream using ffmpeg and transcribes it with Groq.
func (g *GroqWhisperClient) ExtractAudioAndTranscribe(ctx context.Context, streamURL string, cacheKey string, language string) (string, error) {
	// Check memory cache first
	if vtt, ok := g.GetCached(cacheKey); ok {
		return vtt, nil
	}

	// Validate scheme to strictly allow only public HTTP and HTTPS streams
	u, err := url.Parse(streamURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", errors.New("invalid stream URL scheme: must be http or https")
	}

	// Verify ffmpeg exists in system PATH
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", fmt.Errorf("ffmpeg is not installed or available in PATH: %w", err)
	}

	// Stream audio at 24kbps mono MP3 directly to stdout pipe (pipe:1)
	// 24kbps * 7200s = ~21.6MB for a 2-hour movie, well inside Groq's 25MB limit.
	// Enforce -protocol_whitelist to block file://, pipe:, gopher://, concat:, etc. from accessing local filesystem or internal endpoints
	cmd := exec.CommandContext(ctx, ffmpegPath,
		"-protocol_whitelist", "http,https,tcp,tls,crypto",
		"-reconnect", "1",
		"-reconnect_streamed", "1",
		"-reconnect_delay_max", "5",
		"-i", streamURL,
		"-vn",
		"-ac", "1",
		"-ar", "16000",
		"-b:a", "24k",
		"-f", "mp3",
		"pipe:1",
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("ffmpeg audio extraction failed: %w (stderr: %s)", err, stderr.String())
	}

	if stdout.Len() == 0 {
		return "", errors.New("ffmpeg extracted 0 bytes of audio")
	}

	vtt, err := g.Transcribe(ctx, &stdout, "audio.mp3", language)
	if err != nil {
		return "", err
	}

	// Cache successful transcription
	g.SetCached(cacheKey, vtt)
	return vtt, nil
}
