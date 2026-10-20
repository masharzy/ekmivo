package checkout

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5"
)

// HandleAICreditTopup handles merchant-initiated credit purchases. Neither a
// browser redirect nor client-submitted "paid" flag may credit the account.
// Verification reads authoritative financial evidence for the platform receiver.
func (s *Service) HandleAICreditTopup(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("BRIOFOLD_AI_TOPUPS_ENABLED") != "true" {
		fail(w, 503, "AI_TOPUPS_NOT_ENABLED")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil {
		fail(w, 503, "AI_CREDITS_UNAVAILABLE")
		return
	}
	cookie, e := r.Cookie("ekmivo-session")
	if e != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, e := s.Auth.Authenticate(r.Context(), cookie.Value)
	if e != nil {
		authError(w, e)
		return
	}
	ws := r.PathValue("workspaceID")
	if !uuidPattern.MatchString(ws) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if r.Method != "POST" || !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	var role string
	e = s.Auth.DB.QueryRowContext(r.Context(), `SELECT m.role FROM workspace_members m
 JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=$1::uuid
 AND m.user_id=$2::uuid AND u.disabled_at IS NULL LIMIT 1`, ws, actor.UserID).Scan(&role)
	if e == sql.ErrNoRows || e == nil && role != "owner" && role != "admin" {
		fail(w, 403, "ACCESS_DENIED")
		return
	}
	if e != nil {
		fail(w, 503, "AI_CREDITS_UNAVAILABLE")
		return
	}
	if s.Auth.GranularGrants {
		var allowed sql.NullBool
		e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_capability_override($1::uuid,$2::uuid,'workspace:settings')", ws, actor.UserID).Scan(&allowed)
		if e != nil {
			fail(w, 503, "AI_CREDITS_UNAVAILABLE")
			return
		}
		if allowed.Valid && !allowed.Bool {
			fail(w, 403, "ACCESS_DENIED")
			return
		}
	}
	action := r.PathValue("aiCreditAction")
	if action == "purchase" {
		var req struct {
			Amount int64 `json:"amount_minor"`
		}
		key := r.Header.Get("Idempotency-Key")
		if !keyPattern.MatchString(key) || decodeBounded(w, r, &req, 1024) != nil || req.Amount < 1000 || req.Amount > 10000000 {
			fail(w, 422, "INVALID_AI_TOPUP")
			return
		}
		var platform sql.NullString
		if s.Auth.DB.QueryRowContext(r.Context(), "SELECT platform_billing_workspace()").Scan(&platform) != nil ||
			!uuidPattern.MatchString(platform.String) || platform.String == ws || !s.pipelineReady() || s.Pipeline.Live == nil {
			fail(w, 503, "PLATFORM_RECEIVING_UNAVAILABLE")
			return
		}
		var sourcesRaw []byte
		e = s.pipelineScoped(r.Context(), platform.String, "live", func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg10_public_payment_sources($1::uuid,'live')", platform.String).Scan(&sourcesRaw)
		})
		var sources struct {
			Methods []string          `json:"configured_methods"`
			Sources []json.RawMessage `json:"sources"`
		}
		if e != nil || json.Unmarshal(sourcesRaw, &sources) != nil || len(sources.Methods) == 0 || len(sources.Sources) == 0 {
			fail(w, 503, "PLATFORM_RECEIVING_UNAVAILABLE")
			return
		}
		var raw []byte
		e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_ai_topup_issue($1::uuid,$2::uuid,$3,$4)", ws, actor.UserID, req.Amount, key).Scan(&raw)
		if e != nil {
			billingMapped(w, e)
			return
		}
		var order struct {
			ID       string `json:"id"`
			Amount   int64  `json:"amount_minor"`
			Receiver string `json:"receiving_workspace_id"`
			Status   string `json:"status"`
		}
		if json.Unmarshal(raw, &order) != nil || !uuidPattern.MatchString(order.ID) || order.Amount != req.Amount ||
			order.Receiver != platform.String {
			fail(w, 503, "AI_CREDITS_UNAVAILABLE")
			return
		}
		cap := s.token(platform.String, "live", "ai-credit:"+order.ID)
		// Store the immutable financial lookup BEFORE intent creation. Even if
		// a process crashes after the financial write, background recovery can
		// look up the original intent after TokenKey rotation. This digest is
		// only a locator; actual credited money requires live financial proof.
		proofDigest := digest(cap)
		var boundDigest string
		e = s.Auth.DB.QueryRowContext(r.Context(),
			"SELECT briofold_ai_topup_bind_proof($1::uuid,$2::uuid,$3::uuid,$4)",
			ws, actor.UserID, order.ID, proofDigest).Scan(&boundDigest)
		if e != nil {
			billingMapped(w, e)
			return
		}
		if boundDigest != proofDigest {
			fail(w, 409, "AI_TOPUP_LOCATOR_CONFLICT")
			return
		}
		e = s.creationScoped(r.Context(), platform.String, "live", func(tx pgx.Tx) error {
			var result []byte
			return tx.QueryRow(r.Context(), "SELECT pg10_intent($1::uuid,'live',$2,$3,60,$4,$5,$6)",
				platform.String, "AI-"+order.ID, order.Amount, "ai-credit:"+order.ID, proofDigest, digest(order.ID)).Scan(&result)
		})
		if e != nil {
			billingMapped(w, e)
			return
		}
		write(w, 201, map[string]any{"topup_id": order.ID, "checkout_token": cap, "amount_minor": order.Amount, "currency": "BDT", "payment_status": order.Status})
		return
	}
	if action == "reconcile" {
		id := r.PathValue("topupID")
		if !uuidPattern.MatchString(id) {
			fail(w, 404, "NOT_FOUND")
			return
		}
		var platform, proofDigest string
		var amount int64
		e = s.Auth.DB.QueryRowContext(r.Context(),
			"SELECT receiving_workspace_id,amount_minor,checkout_token_digest FROM briofold_ai_topup_payment_context($1::uuid,$2::uuid,$3::uuid)",
			ws, actor.UserID, id).Scan(&platform, &amount, &proofDigest)
		if e == sql.ErrNoRows {
			fail(w, 404, "NOT_FOUND")
			return
		}
		if e != nil || !uuidPattern.MatchString(platform) || !validAICreditProofDigest(proofDigest) || s.Pipeline.Live == nil {
			fail(w, 503, "AI_CREDITS_UNAVAILABLE")
			return
		}
		// Never regenerate the lookup from the current signing key: a pending
		// checkout may have been issued before a key rotation.
		var proofRaw []byte
		var checkoutState sql.NullString
		e = s.Pipeline.Live.QueryRow(r.Context(), "SELECT pg13_platform_payment($1),pg05_checkout_view($1)->>'state'", proofDigest).Scan(&proofRaw, &checkoutState)
		proof, verified, proofErr := decodeBillingPaymentProof(proofRaw, platform, amount)
		if e != nil || proofErr != nil {
			fail(w, 503, "AI_TOPUP_VERIFICATION_UNAVAILABLE")
			return
		}
		if !verified {
			writeUnverifiedBilling(w, checkoutState.String)
			return
		}
		var credit []byte
		e = s.Auth.DB.QueryRowContext(r.Context(),
			"SELECT briofold_ai_topup_apply_verified($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5)",
			ws, actor.UserID, id, proof.ID, proof.Amount).Scan(&credit)
		if e != nil {
			billingMapped(w, e)
			return
		}
		write(w, 200, map[string]any{"payment_status": "paid", "topup_id": id, "credit": json.RawMessage(credit)})
		return
	}
	fail(w, 404, "NOT_FOUND")
}

// A proof digest is a 64-character lowercase SHA-256 hex locator, not proof
// that a payment occurred. All payment state comes from the financial realm.
func validAICreditProofDigest(s string) bool {
	if len(s) != 64 { return false }
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') { return false }
	}
	return true
}
