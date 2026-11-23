package checkout

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPaymentProofsFlagOffIsNotFound(t *testing.T) {
	t.Setenv("BRIOFOLD_PAYMENT_PROOFS_ENABLED", "")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/public/checkout/x/proof", bytes.NewBufferString(`{"trx_id":"ABC12345"}`))
	(&Service{}).HandlePublicProof(rec, req)
	if rec.Code != 404 {
		t.Fatalf("flag off must answer 404, got %d", rec.Code)
	}
}

func TestCleanProofImageReencodesAndRejects(t *testing.T) {
	picture := image.NewRGBA(image.Rect(0, 0, 40, 30))
	picture.Set(3, 4, color.RGBA{R: 200, A: 255})
	var src bytes.Buffer
	if err := png.Encode(&src, picture); err != nil {
		t.Fatal(err)
	}
	out, err := cleanProofImage(src.Bytes())
	if err != nil {
		t.Fatalf("a PNG screenshot must be accepted: %v", err)
	}
	if http.DetectContentType(out) != "image/jpeg" {
		t.Fatal("output must be a fresh JPEG")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(out))
	if err != nil || cfg.Width != 40 || cfg.Height != 30 {
		t.Fatal("re-encoded picture must keep its size")
	}
	for name, bad := range map[string][]byte{
		"pdf":       []byte("%PDF-1.4 fake"),
		"html":      []byte("<html><script>alert(1)</script></html>"),
		"truncated": src.Bytes()[:20],
	} {
		if _, err := cleanProofImage(bad); err == nil {
			t.Fatalf("%s must be rejected", name)
		}
	}
}
