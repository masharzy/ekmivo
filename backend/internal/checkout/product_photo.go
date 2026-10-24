package checkout

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"strings"
)

type productPhotoSignature struct {
	Hash   string
	Colors [3]int
}

// Version 1 measures local visual similarity, not semantic product identity.
// Decode dimensions before allocation; keep query images transient.
func productPhotoFeatures(content []byte) (productPhotoSignature, error) {
	var out productPhotoSignature
	if len(content) == 0 || len(content) > 5*1024*1024 {
		return out, errors.New("photo size")
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(content))
	if err != nil || (format != "png" && format != "jpeg") || cfg.Width < 1 || cfg.Height < 1 || cfg.Width > 4096 || cfg.Height > 4096 || int64(cfg.Width)*int64(cfg.Height) > 8000000 {
		return out, errors.New("photo dimensions")
	}
	im, _, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return out, err
	}
	var gray [8][9]uint64
	var count [8][9]uint64
	var color [3]uint64
	for y := 0; y < cfg.Height; y++ {
		for x := 0; x < cfg.Width; x++ {
			r, g, b, a := im.At(im.Bounds().Min.X+x, im.Bounds().Min.Y+y).RGBA()
			// Composite alpha onto a white background; transparent metadata has no score.
			rr, gg, bb := (r+65535-a)/257, (g+65535-a)/257, (b+65535-a)/257
			color[0] += uint64(rr)
			color[1] += uint64(gg)
			color[2] += uint64(bb)
			cy, cx := y*8/cfg.Height, x*9/cfg.Width
			gray[cy][cx] += uint64(rr*299 + gg*587 + bb*114)
			count[cy][cx]++
		}
	}
	for y := 0; y < 8; y++ {
		for x := 0; x < 9; x++ {
			if count[y][x] > 0 {
				gray[y][x] /= count[y][x]
			} else {
				r, g, b, a := im.At(im.Bounds().Min.X+x*cfg.Width/9, im.Bounds().Min.Y+y*cfg.Height/8).RGBA()
				gray[y][x] = uint64(((r+65535-a)/257)*299 + ((g+65535-a)/257)*587 + ((b+65535-a)/257)*114)
			}
		}
	}
	var hash strings.Builder
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			if gray[y][x] > gray[y][x+1] {
				hash.WriteByte('1')
			} else {
				hash.WriteByte('0')
			}
		}
	}
	out.Hash = hash.String()
	pixels := uint64(cfg.Width) * uint64(cfg.Height)
	for i := range color {
		out.Colors[i] = int(color[i] / pixels)
	}
	return out, nil
}
func (s *Service) commercePhotoAction(w http.ResponseWriter, r *http.Request, ws, realm, actor, key, action string, b map[string]any) {
	if os.Getenv("BRIOFOLD_PRODUCT_PHOTOS_ENABLED") != "true" {
		fail(w, 503, "PRODUCT_PHOTOS_UNAVAILABLE")
		return
	}
	if action == "photo-index" {
		id, _ := b["id"].(string)
		if !uuidPattern.MatchString(id) {
			fail(w, 422, "INVALID_PHOTO")
			return
		}
		// The index writer separately enforces the product-management role and SHA.
		var access []byte
		if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_photo_index_source($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, actor, id).Scan(&access); err != nil {
			inboxWorkFailure(w, err)
			return
		}
		var source struct {
			Key string `json:"object_key"`
			SHA string `json:"sha256"`
		}
		if json.Unmarshal(access, &source) != nil || source.Key == "" {
			fail(w, 503, "PHOTO_SOURCE_UNAVAILABLE")
			return
		}
		content, err := objectRequest(r.Context(), "GET", source.Key, nil)
		if err != nil {
			fail(w, 503, "PRIVATE_STORAGE_UNAVAILABLE")
			return
		}
		hash := sha256.Sum256(content)
		if hex.EncodeToString(hash[:]) != source.SHA {
			fail(w, 409, "PHOTO_SOURCE_CHANGED")
			return
		}
		sig, err := productPhotoFeatures(content)
		if err != nil {
			fail(w, 422, "INVALID_PHOTO")
			return
		}
		var indexed bool
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_photo_index($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::jsonb)", ws, realm, actor, id, source.SHA, sig.Hash, photoColorsJSON(sig)).Scan(&indexed)
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, map[string]bool{"indexed": indexed})
		return
	}
	query, _ := b["query"].(string)
	encoded, _ := b["data"].(string)
	if len(query) > 400 || len(encoded) > 700000 {
		fail(w, 422, "INVALID_PHOTO_QUERY")
		return
	}
	var sig productPhotoSignature
	var hash any
	var colors any
	if encoded != "" {
		content, err := base64.StdEncoding.Strict().DecodeString(encoded)
		if err != nil || len(content) > 524288 {
			fail(w, 422, "INVALID_PHOTO")
			return
		}
		sig, err = productPhotoFeatures(content)
		if err != nil {
			fail(w, 422, "INVALID_PHOTO")
			return
		}
		hash = sig.Hash
		colors = photoColorsJSON(sig)
	}
	if hash == nil && strings.TrimSpace(query) == "" {
		fail(w, 422, "PHOTO_OR_TEXT_REQUIRED")
		return
	}
	var raw []byte
	var err error
	if action == "photo-evaluate" {
		expected, _ := b["expected_product_id"].(string)
		if !uuidPattern.MatchString(expected) {
			fail(w, 422, "EXPECTED_PRODUCT_REQUIRED")
			return
		}
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_photo_evaluate($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::jsonb,$8)", ws, realm, actor, key, expected, hash, colors, query).Scan(&raw)
	} else {
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_photo_search($1::uuid,$2,$3::uuid,$4,$5::jsonb,$6)", ws, realm, actor, hash, colors, query).Scan(&raw)
	}
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	write(w, 200, json.RawMessage(raw))
}
func photoColorsJSON(sig productPhotoSignature) string {
	raw, _ := json.Marshal(sig.Colors)
	return string(raw)
}
