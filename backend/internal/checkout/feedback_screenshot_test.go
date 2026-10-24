package checkout

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestFeedbackScreenshot(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	for _, format := range []string{"png", "jpeg"} {
		var buf bytes.Buffer
		if format == "png" {
			_ = png.Encode(&buf, img)
		} else {
			_ = jpeg.Encode(&buf, img, nil)
		}
		input := map[string]any{"screenshot": map[string]any{"data": base64.StdEncoding.EncodeToString(buf.Bytes()), "consent": true, "mime": "untrusted/client-value"}}
		if err := normalizeFeedbackScreenshot(input); err != nil {
			t.Fatal(err)
		}
		got := input["screenshot"].(map[string]any)
		if got["mime"] != "image/png" {
			t.Fatal("image not normalized")
		}
		raw, _ := base64.StdEncoding.DecodeString(got["data"].(string))
		_, format, err := image.DecodeConfig(bytes.NewReader(raw))
		if err != nil || format != "png" {
			t.Fatal("invalid normalized PNG")
		}
	}
	for _, value := range []any{true, "x", map[string]any{"data": "abcd"}, map[string]any{"data": "<svg onload='x'/>", "consent": true}, map[string]any{"data": base64.StdEncoding.EncodeToString([]byte("<html>")), "consent": true}} {
		if normalizeFeedbackScreenshot(map[string]any{"screenshot": value}) == nil {
			t.Fatal("invalid or unconsented screenshot accepted")
		}
	}
	if normalizeFeedbackScreenshot(map[string]any{"subject": "No screenshot"}) != nil {
		t.Fatal("optional screenshot rejected")
	}
}
