package checkout

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"

	"github.com/jackc/pgx/v5"
)

// Owner HTTP surface for AI selling: Settings -> AI selling and the payment review queue. Every database function
// re-checks owner/admin membership; these handlers only authenticate the session, bound the input and keep receiving
// numbers masked (the full number is only ever sent to the buyer by the tool loop).

type aiOwnerAccount struct {
	ID       string `json:"id"`
	Method   string `json:"method"`
	Masked   string `json:"number_masked"`
	Label    string `json:"label"`
	Disabled bool   `json:"disabled"`
}

var aiSellingFields = map[string]string{
	"ai_selling_enabled": "bool", "cod_enabled": "bool", "negotiation_enabled": "bool",
	"cod_charge_minor": "money", "delivery_dhaka_minor": "money", "delivery_outside_minor": "money",
	"max_discount_pct": "pct", "draft_expiry_hours": "hours", "wrong_trx_limit": "limit", "receiving_account_ids": "ids",
	"handover_above_minor": "money",
}

func (s *Service) aiOwnerActor(w http.ResponseWriter, r *http.Request) (ws, realm, user string, ok bool) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if !aiToolsEnabled() {
		fail(w, 404, "NOT_ENABLED")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	cookie, e := r.Cookie("briofold-session")
	if e != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, e := s.Auth.Authenticate(r.Context(), cookie.Value)
	if e != nil {
		authError(w, e)
		return
	}
	ws, realm = r.PathValue("workspaceID"), r.URL.Query().Get("environment")
	if realm == "" {
		realm = "live"
	}
	if !uuidPattern.MatchString(ws) || (realm != "live" && realm != "sandbox") {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	return ws, realm, actor.UserID, true
}

func (s *Service) aiOwnerAccounts(ctx context.Context, ws, realm string) ([]aiOwnerAccount, error) {
	out := []aiOwnerAccount{}
	// Only the stored suffix and the owner's own label are read; the encrypted number is never decrypted here.
	err := s.scoped(ctx, ws, realm, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, "SELECT account_id,method,coalesce(display_suffix,''),coalesce(account_label,''),disabled_at IS NOT NULL FROM pg06_phone_account_cipher($1::uuid,$2)", ws, realm)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var a aiOwnerAccount
			var suffix string
			if err := rows.Scan(&a.ID, &a.Method, &suffix, &a.Label, &a.Disabled); err != nil {
				return err
			}
			a.Masked = "•••• " + suffix
			out = append(out, a)
		}
		return rows.Err()
	})
	return out, err
}

// aiSellingPatch keeps only known fields with the right JSON type; ranges are enforced by table CHECKs (-> 422).
func aiSellingPatch(in map[string]json.RawMessage, accounts []aiOwnerAccount) (map[string]any, bool) {
	if len(in) == 0 || len(in) > len(aiSellingFields) {
		return nil, false
	}
	out := map[string]any{}
	for k, raw := range in {
		kind, known := aiSellingFields[k]
		if !known {
			return nil, false
		}
		switch kind {
		case "bool":
			var v bool
			if json.Unmarshal(raw, &v) != nil {
				return nil, false
			}
			out[k] = v
		case "ids":
			var ids []string
			if json.Unmarshal(raw, &ids) != nil || len(ids) > 10 {
				return nil, false
			}
			for _, id := range ids {
				if !slices.ContainsFunc(accounts, func(a aiOwnerAccount) bool { return a.ID == id && !a.Disabled }) {
					return nil, false
				}
			}
			out[k] = ids
		default:
			var v int64
			if json.Unmarshal(raw, &v) != nil || v < 0 {
				return nil, false
			}
			out[k] = v
		}
	}
	return out, true
}

func (s *Service) HandleAISelling(w http.ResponseWriter, r *http.Request) {
	ws, realm, user, ok := s.aiOwnerActor(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	var raw []byte
	var err error
	if r.Method == http.MethodPost {
		var b struct {
			Revision int64                      `json:"revision"`
			Patch    map[string]json.RawMessage `json:"patch"`
		}
		if decodeBounded(w, r, &b, 4096) != nil {
			fail(w, 422, "INVALID_SETTINGS")
			return
		}
		// Membership first, so a non-owner never learns anything about the realm accounts.
		if err = s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_selling_read($1::uuid,$2,$3::uuid)", ws, realm, user).Scan(&raw); err != nil {
			inboxWorkFailure(w, err)
			return
		}
		accounts, aerr := s.aiOwnerAccounts(ctx, ws, realm)
		if _, wantsIDs := b.Patch["receiving_account_ids"]; wantsIDs && aerr != nil {
			fail(w, 503, "RECEIVING_SOURCE_UNAVAILABLE")
			return
		}
		patch, valid := aiSellingPatch(b.Patch, accounts)
		if !valid || b.Revision < 0 {
			fail(w, 422, "INVALID_SETTINGS")
			return
		}
		body, _ := json.Marshal(patch)
		if err = s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_selling_save($1::uuid,$2,$3::uuid,$4,$5::jsonb)", ws, realm, user, b.Revision, string(body)).Scan(&raw); err != nil {
			inboxWorkFailure(w, err)
			return
		}
	} else if r.Method == http.MethodGet {
		if err = s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_selling_read($1::uuid,$2,$3::uuid)", ws, realm, user).Scan(&raw); err != nil {
			inboxWorkFailure(w, err)
			return
		}
	} else {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	accounts, aerr := s.aiOwnerAccounts(ctx, ws, realm)
	resp := map[string]any{"settings": json.RawMessage(raw), "accounts": accounts, "accounts_available": aerr == nil, "environment": realm}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Service) HandleAIPaymentReviews(w http.ResponseWriter, r *http.Request) {
	ws, realm, user, ok := s.aiOwnerActor(w, r)
	if !ok {
		return
	}
	var raw []byte
	var err error
	switch r.Method {
	case http.MethodGet:
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_ai_review_queue($1::uuid,$2,$3::uuid)", ws, realm, user).Scan(&raw)
	case http.MethodPost:
		var b struct {
			Claim    string `json:"claim_id"`
			Decision string `json:"decision"`
		}
		if decodeBounded(w, r, &b, 1024) != nil || !uuidPattern.MatchString(b.Claim) || (b.Decision != "approve" && b.Decision != "reject") {
			fail(w, 422, "INVALID_DECISION")
			return
		}
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_ai_review_decide($1::uuid,$2,$3::uuid,$4::uuid,$5)", ws, realm, user, b.Claim, b.Decision).Scan(&raw)
	default:
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(raw)
}
