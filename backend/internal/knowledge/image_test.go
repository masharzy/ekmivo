package knowledge

import (
	"context"
	"testing"
)

func TestFetchPublicImageRejectsInternalTargets(t *testing.T) {
	for _, raw := range []string{
		"https://169.254.169.254/latest/meta-data/",
		"https://127.0.0.1/a.png",
		"https://10.0.0.5/a.png",
		"https://100.64.0.1/a.png",
		"https://[::1]/a.png",
		"https://localhost/a.png",
		"https://metadata.internal/a.png",
		"http://example.com/a.png",
		"https://user:pw@example.com/a.png",
		"https://example.com:8443/a.png",
		"file:///etc/passwd",
	} {
		if _, _, err := FetchPublicImage(context.Background(), raw); err == nil {
			t.Fatalf("%s must be refused", raw)
		}
	}
}

func TestSniffImageIgnoresClaimedType(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
	if typ, ok := sniffImage(png); !ok || typ != "image/png" {
		t.Fatalf("png not recognised: %q %v", typ, ok)
	}
	if _, ok := sniffImage([]byte("<html><script>alert(1)</script>")); ok {
		t.Fatal("html accepted as image")
	}
	if _, ok := sniffImage([]byte("GIF89a......")); ok {
		t.Fatal("gif is not an accepted catalog format")
	}
}
