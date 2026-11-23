package checkout

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgconn"
)

// Payment proofs (owner decision 2026-11-22): when automatic SMS verification
// cannot happen (the shop's phone is offline, or nothing matched yet), the
// customer can leave a Transaction ID and/or receipt photos on the checkout.
// The shop checks them by hand. Nothing here verifies a payment or changes an
// amount: migration 0265 only stores what the customer submitted.
//
//	GET  /v1/public/checkout/{token}/proof        what was submitted (no TrxID, no photos)
//	POST /v1/public/checkout/{token}/proof        {"trx_id":"..."}
//	POST /v1/public/checkout/{token}/proof/image  one JPEG or PNG, at most 8 MB
//
// Photos are decoded and re-encoded as JPEG (drops metadata and anything that
// is not the picture), then stored in private object storage (Cloudflare R2)
// under payment-proofs/. The bucket's lifecycle rule removes them after 30 days.

const proofImageLimit = 8 << 20

func paymentProofsEnabled() bool {
	return os.Getenv("BRIOFOLD_PAYMENT_PROOFS_ENABLED") == "true"
}

func (s *Service) HandlePublicProof(w http.ResponseWriter, r *http.Request) {
	if !paymentProofsEnabled() || !s.ready() {
		fail(w, 404, "NOT_FOUND")
		return
	}
	token := r.PathValue("token")
	if !tokenPattern.MatchString(token) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	limit := 60
	if r.Method == http.MethodPost {
		limit = 10
	}
	if !s.budget(w, "proof:"+digest(token)+":"+r.Method, limit) {
		return
	}
	pool, initial, err := s.lookupCheckout(r, token)
	if err != nil {
		mapped(w, err)
		return
	}
	if pool == nil || len(initial) == 0 || string(initial) == "null" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var raw []byte
	switch {
	case r.Method == http.MethodGet:
		err = pool.QueryRow(r.Context(), "SELECT briofold_proof_public($1)", digest(token)).Scan(&raw)
	case r.Method == http.MethodPost && r.PathValue("part") == "":
		if !originAllowed(r) {
			fail(w, 403, "ORIGIN_DENIED")
			return
		}
		var body struct {
			TrxID string `json:"trx_id"`
		}
		if decodeBounded(w, r, &body, 1024) != nil {
			fail(w, 422, "INVALID_REQUEST")
			return
		}
		err = pool.QueryRow(r.Context(), "SELECT briofold_proof_submit($1,$2,NULL)", digest(token), body.TrxID).Scan(&raw)
	case r.Method == http.MethodPost && r.PathValue("part") == "image":
		if !originAllowed(r) {
			fail(w, 403, "ORIGIN_DENIED")
			return
		}
		content, e := io.ReadAll(http.MaxBytesReader(w, r.Body, proofImageLimit))
		if e != nil || len(content) == 0 {
			fail(w, 413, "PROOF_IMAGE_TOO_LARGE")
			return
		}
		clean, e := cleanProofImage(content)
		if e != nil {
			fail(w, 422, "PROOF_IMAGE_INVALID")
			return
		}
		id := newUUID()
		if id == "" {
			fail(w, 503, "PROOF_STORAGE_UNAVAILABLE")
			return
		}
		key := "payment-proofs/" + id + ".jpg"
		if _, e = objectRequest(r.Context(), "PUT", key, clean); e != nil {
			log.Printf("payment proof photo store failed: %v", e) // fixed reasons only, no keys or customer data
			fail(w, 503, "PROOF_STORAGE_UNAVAILABLE")
			return
		}
		sum := sha256.Sum256(clean)
		meta, _ := json.Marshal(map[string]any{"key": key, "bytes": len(clean), "sha256": hex.EncodeToString(sum[:])})
		err = pool.QueryRow(r.Context(), "SELECT briofold_proof_submit($1,NULL,$2::jsonb)", digest(token), string(meta)).Scan(&raw)
		if err != nil {
			_, _ = objectRequest(r.Context(), "DELETE", key, nil)
		}
	default:
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	if err != nil {
		proofFailure(w, err)
		return
	}
	if len(raw) == 0 || string(raw) == "null" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	status := 200
	if r.Method == http.MethodPost {
		status = 201
	}
	write(w, status, json.RawMessage(raw))
}

// cleanProofImage accepts a JPEG or PNG of at most 25 megapixels and returns
// a fresh JPEG of the same picture.
func cleanProofImage(content []byte) ([]byte, error) {
	typ := http.DetectContentType(content)
	if typ != "image/jpeg" && typ != "image/png" {
		return nil, errors.New("unsupported type")
	}
	config, _, e := image.DecodeConfig(bytes.NewReader(content))
	if e != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 25000000 {
		return nil, errors.New("invalid size")
	}
	picture, _, e := image.Decode(bytes.NewReader(content))
	if e != nil {
		return nil, e
	}
	var out bytes.Buffer
	if e = jpeg.Encode(&out, picture, &jpeg.Options{Quality: 85}); e != nil {
		return nil, e
	}
	return out.Bytes(), nil
}

// proofFailure keeps the specific reasons the checkout page can explain.
func proofFailure(w http.ResponseWriter, err error) {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "22023" {
		switch pg.Message {
		case "INVALID_TRX_ID", "INVALID_IMAGE", "EMPTY_PROOF":
			fail(w, 422, pg.Message)
			return
		}
	}
	mapped(w, err)
}
