package checkout

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	_ "image/jpeg"
	"image/png"
)

// Screenshots are small, decoded raster images. Re-encoding removes metadata
// and rejects SVG/HTML, malformed images and excessive decoded dimensions.
func normalizeFeedbackScreenshot(body map[string]any) error {
	raw, present := body["screenshot"]
	if !present || raw == nil {
		delete(body, "screenshot")
		return nil
	}
	attachment, ok := raw.(map[string]any)
	if !ok || attachment["consent"] != true {
		return errors.New("screenshot consent required")
	}
	encoded, ok := attachment["data"].(string)
	if !ok || len(encoded) > 700000 {
		return errors.New("screenshot too large")
	}
	content, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || len(content) == 0 || len(content) > 524288 {
		return errors.New("invalid screenshot")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(content))
	if err != nil || (format != "png" && format != "jpeg") || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 || int64(config.Width)*int64(config.Height) > 8000000 {
		return errors.New("invalid screenshot dimensions or format")
	}
	decoded, _, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return errors.New("invalid screenshot")
	}
	var clean bytes.Buffer
	if err = png.Encode(&clean, decoded); err != nil || clean.Len() > 524288 {
		return errors.New("normalized screenshot too large")
	}
	body["screenshot"] = map[string]any{"data": base64.StdEncoding.EncodeToString(clean.Bytes()), "mime": "image/png", "consent": true}
	return nil
}
