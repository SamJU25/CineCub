package subtitles

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGroqClientConfigurationAndCache(t *testing.T) {
	client := NewGroqClient("")
	if client.IsConfigured() {
		t.Errorf("expected IsConfigured to be false for empty key")
	}

	client = NewGroqClient("test-key")
	if !client.IsConfigured() {
		t.Errorf("expected IsConfigured to be true")
	}

	// Cache test
	_, ok := client.GetCached("movie_123")
	if ok {
		t.Errorf("expected cache miss")
	}

	testVTT := "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world!"
	client.SetCached("movie_123", testVTT)

	cached, ok := client.GetCached("movie_123")
	if !ok || cached != testVTT {
		t.Errorf("expected cache hit with matching VTT, got %v, %s", ok, cached)
	}
}

func TestGroqClientTranscribe(t *testing.T) {
	mockVTT := "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTesting Groq Whisper."

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer test-api-key" {
			t.Errorf("expected Authorization: Bearer test-api-key, got %s", auth)
		}

		err := r.ParseMultipartForm(10 * 1024 * 1024)
		if err != nil {
			t.Fatalf("failed to parse multipart form: %v", err)
		}

		model := r.FormValue("model")
		if model != defaultModel {
			t.Errorf("expected model %s, got %s", defaultModel, model)
		}

		format := r.FormValue("response_format")
		if format != "vtt" {
			t.Errorf("expected response_format vtt, got %s", format)
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("missing form file: %v", err)
		}
		defer file.Close()

		if !strings.HasSuffix(header.Filename, ".mp3") {
			t.Errorf("expected .mp3 filename, got %s", header.Filename)
		}

		w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(mockVTT))
	}))
	defer server.Close()

	client := NewGroqClient("test-api-key")
	client.SetBaseURL(server.URL)
	client.httpClient = server.Client()

	fakeAudio := bytes.NewBufferString("fake-mp3-audio-bytes-data")
	res, err := client.Transcribe(context.Background(), fakeAudio, "sample.mp3", "en")
	if err != nil {
		t.Fatalf("expected successful transcription, got error: %v", err)
	}

	if res != mockVTT {
		t.Errorf("expected VTT %q, got %q", mockVTT, res)
	}
}

func TestExtractAudioAndTranscribe_InvalidScheme(t *testing.T) {
	client := NewGroqClient("test-api-key")

	maliciousURLs := []string{
		"file:///etc/passwd",
		"gopher://127.0.0.1:6379/_flushall",
		"ftp://anonymous@evil.com/payload.mp3",
		"data:text/plain;base64,AAAA",
		"",
	}

	for _, badURL := range maliciousURLs {
		_, err := client.ExtractAudioAndTranscribe(context.Background(), badURL, "test-key", "en")
		if err == nil {
			t.Errorf("expected error for malicious stream URL %q, got nil", badURL)
		}
	}
}

