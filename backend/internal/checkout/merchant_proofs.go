package checkout

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Receipt review for the shop (owner decision 2026-11-23): uploaded receipts
// are a separate list on the dashboard with a badge for new ones. Nothing here
// creates an SMS-verified payment or changes an amount (0270, 0271).
//
//	GET  /v1/workspaces/{ws}/payment-proofs?environment=live        list + new count
//	GET  /v1/workspaces/{ws}/payment-proofs/{intent}/images/{n}     photo n (JPEG)
//	POST /v1/workspaces/{ws}/payment-proofs/{intent}/seen           clears "new"
//	POST /v1/workspaces/{ws}/payment-proofs/{intent}/reject         {"reason":"..."}
//	POST /v1/workspaces/{ws}/payment-proofs/{intent}/approve        confirmed by the shop (0271)
//
// Same authorisation as the payment-intent list: payments:read for reading,
// payments:write for changes, browser origin checked on changes.
func (s *Service) HandleMerchantProofs(w http.ResponseWriter, r *http.Request) {
	if !paymentProofsEnabled() || !s.ready() {
		fail(w, 404, "NOT_FOUND")
		return
	}
	ws := r.PathValue("workspaceID")
	realm := explicitRealm(r)
	if !uuidPattern.MatchString(ws) || realm == "" {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	intent := r.PathValue("intentID")
	if intent != "" && !uuidPattern.MatchString(intent) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if realm == "live" && s.pipelinePool(realm) == nil {
		fail(w, 503, "LIVE_SOURCE_NOT_CONNECTED")
		return
	}
	if r.Method != "GET" && !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	cap := "payments:read"
	if r.Method != "GET" {
		cap = "payments:write"
	}
	if err := s.merchant(r, ws, realm, cap); err != nil {
		authError(w, err)
		return
	}
	if !s.budget(w, "proofs:"+ws+":"+r.Method, 240) {
		return
	}
	var raw []byte
	var key string
	action := r.PathValue("action")
	err := s.scoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		switch {
		case r.Method == "GET" && intent == "":
			return tx.QueryRow(r.Context(), "SELECT briofold_proof_list($1::uuid,$2)", ws, realm).Scan(&raw)
		case r.Method == "GET":
			n, e := strconv.Atoi(r.PathValue("n"))
			if e != nil || n < 0 || n > 4 {
				return pgx.ErrNoRows
			}
			var k *string
			if e = tx.QueryRow(r.Context(), "SELECT briofold_proof_image($1::uuid,$2,$3::uuid,$4)", ws, realm, intent, n).Scan(&k); e != nil {
				return e
			}
			if k != nil {
				key = *k
			}
			return nil
		case action == "seen":
			return tx.QueryRow(r.Context(), "SELECT briofold_proof_seen($1::uuid,$2,$3::uuid)", ws, realm, intent).Scan(&raw)
		case action == "approve":
			return tx.QueryRow(r.Context(), "SELECT briofold_proof_approve($1::uuid,$2,$3::uuid)", ws, realm, intent).Scan(&raw)
		case action == "reject":
			var body struct {
				Reason string `json:"reason"`
			}
			_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
			return tx.QueryRow(r.Context(), "SELECT briofold_proof_reject($1::uuid,$2,$3::uuid,$4)", ws, realm, intent, strings.TrimSpace(body.Reason)).Scan(&raw)
		default:
			return errMethod
		}
	})
	if errors.Is(err, errMethod) {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if err != nil {
		mapped(w, err)
		return
	}
	if r.Method == "GET" && intent != "" {
		if key == "" {
			fail(w, 404, "NOT_FOUND")
			return
		}
		photo, e := objectRequest(r.Context(), "GET", key, nil)
		if e != nil {
			log.Printf("payment proof photo read failed: %v", e)
			fail(w, 503, "PROOF_STORAGE_UNAVAILABLE")
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "private, max-age=300")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.WriteHeader(200)
		_, _ = w.Write(photo)
		return
	}
	if len(raw) == 0 || string(raw) == "null" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	write(w, 200, json.RawMessage(raw))
}

type proofMethodError struct{}

func (proofMethodError) Error() string { return "method not allowed" }

var errMethod error = proofMethodError{}

// supplementConfirmedReceipts adds receipts the shop accepted (0271) to the first,
// unfiltered page of Transactions, marked "confirmed by the shop".
func (s *Service) supplementConfirmedReceipts(r *http.Request, ws, realm string, result map[string]any) {
	if !paymentProofsEnabled() {
		return
	}
	q := r.URL.Query()
	for _, k := range []string{"cursor", "status", "account", "method", "from", "to", "q"} {
		if q.Get(k) != "" {
			return
		}
	}
	items, ok := result["items"].([]any)
	if !ok {
		return
	}
	var raw []byte
	if err := s.scoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT briofold_proof_confirmed($1::uuid,$2)", ws, realm).Scan(&raw)
	}); err != nil || len(raw) == 0 {
		return
	}
	var extra []any
	if json.Unmarshal(raw, &extra) != nil || len(extra) == 0 {
		return
	}
	merged := append(extra, items...)
	stamp := func(v any) string {
		if m, ok := v.(map[string]any); ok {
			if s, ok := m["verified_at"].(string); ok {
				return s
			}
		}
		return ""
	}
	sort.SliceStable(merged, func(i, j int) bool { return stamp(merged[i]) > stamp(merged[j]) })
	result["items"] = merged
}
