package subtitles

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func TestFileRefFromURL(t *testing.T) {
	cases := []struct {
		in  string
		ok  bool
		ref string
	}{
		{"/subtitle/1234/abc", true, "1234/abc"},
		{"https://dl.subdl.com/subtitle/1234/abc", true, "1234/abc"},
		{"/subtitle/1234/abc?api_key=XYZ", true, "1234/abc"}, // query stripped
		{"/subtitle/1234-5678.zip?api_key=XYZ", true, "1234-5678.zip"},
		{"/subtitle/1234-5678.zip", true, "1234-5678.zip"}, // packed zip now supported
		{"https://dl.subdl.com/subtitle/1234-5678.zip", true, "1234-5678.zip"},
		{"/subtitle/1234/", true, "1234"}, // trailing slash trimmed to a valid single-segment ref
		{"/subtitle//", false, ""},
		{"", false, ""},
	}
	for _, tc := range cases {
		got, ok := fileRefFromURL(tc.in)
		if ok != tc.ok || (ok && got != tc.ref) {
			t.Errorf("fileRefFromURL(%q) = (%q,%v), want (%q,%v)", tc.in, got, ok, tc.ref, tc.ok)
		}
	}
}

func TestValidRef(t *testing.T) {
	if !validRef("1234/abc") {
		t.Error("expected valid ref '1234/abc'")
	}
	if !validRef("abcDEF_123/xyz-9") {
		t.Error("expected valid ref 'abcDEF_123/xyz-9'")
	}
	if !validRef("1234-5678.zip") {
		t.Error("expected valid packed-zip ref '1234-5678.zip'")
	}
	if !validRef("1234") {
		t.Error("expected valid single-segment ref '1234'")
	}
	if validRef("../../etc/passwd") {
		t.Error("expected invalid: path traversal")
	}
	if validRef("https://evil.com/x/y") {
		t.Error("expected invalid: URL scheme in ref")
	}
	if validRef("/subtitle/1234/abc") {
		t.Error("expected invalid: leading slash not allowed in Download token")
	}
}

func TestSRTToVTTConverts(t *testing.T) {
	srt := "\uFEFF1\r\n00:00:01,000 --> 00:00:04,000\r\nHello world\r\n\r\n2\r\n00:00:05,500 --> 00:00:07,000\r\nSecond line\r\n"
	out := SRTToVTT([]byte(srt))
	vtt := string(out)

	if !strings.HasPrefix(vtt, "WEBVTT") {
		t.Errorf("expected WEBVTT header, got %q", vtt[:min(len(vtt), 20)])
	}
	if !strings.Contains(vtt, "00:00:01.000 --> 00:00:04.000") {
		t.Errorf("expected comma->dot timestamp conversion, got:\n%s", vtt)
	}
	if !strings.Contains(vtt, "Hello world") {
		t.Errorf("expected cue text preserved, got:\n%s", vtt)
	}
	if strings.Contains(vtt, "Hello world\nSecond line") {
		t.Errorf("expected blank line between cues, got:\n%s", vtt)
	}
	// The BOM must be gone.
	if strings.Contains(vtt, "\uFEFF") {
		t.Errorf("expected BOM removed, got:\n%s", vtt)
	}
}

func TestSRTToVTTAlreadyVTT(t *testing.T) {
	in := "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello\n"
	out := SRTToVTT([]byte(in))
	if string(out) != in {
		t.Errorf("expected pass-through, got:\n%s", string(out))
	}
}

func TestSRTWithoutIndexLines(t *testing.T) {
	srt := "00:00:01,000 --> 00:00:04,000\nJust a timestamp block\n"
	out := SRTToVTT([]byte(srt))
	vtt := string(out)
	if !strings.Contains(vtt, "00:00:01.000 --> 00:00:04.000") {
		t.Errorf("expected timestamp conversion even without index, got:\n%s", vtt)
	}
}

func TestExtFromNameAndSniff(t *testing.T) {
	if got := extFromName(`attachment; filename="Ep.S01E01.srt"`, nil); got != "srt" {
		t.Errorf("expected srt from disposition, got %q", got)
	}
	if got := sniffExt([]byte("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi")); got != "vtt" {
		t.Errorf("expected vtt from sniff, got %q", got)
	}
	if got := sniffExt([]byte("1\n00:00:01,000 --> 00:00:04,000\nhi")); got != "srt" {
		t.Errorf("expected srt from sniff, got %q", got)
	}
}

func TestExtractFromZip(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("Episode.One.srt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte("1\n00:00:01,000 --> 00:00:04,000\nHello zip\n")); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}

	body, ext, err := extractFromZip(buf.Bytes())
	if err != nil {
		t.Fatalf("extractFromZip returned error: %v", err)
	}
	if ext != "srt" {
		t.Errorf("expected ext srt, got %q", ext)
	}
	if !strings.Contains(string(body), "Hello zip") {
		t.Errorf("expected zip content preserved, got:\n%s", string(body))
	}
}

func TestExtractFromZipNoSubtitle(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("Readme.txt")
	_, _ = w.Write([]byte("hello"))
	_, _ = zw.Create("notes.md")
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if _, _, err := extractFromZip(buf.Bytes()); err == nil {
		t.Error("expected error when no subtitle file in pack")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
