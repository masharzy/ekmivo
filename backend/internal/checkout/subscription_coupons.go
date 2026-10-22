package checkout

import (
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"net/http"
)

func subscriptionCouponError(w http.ResponseWriter, err error) {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Message {
		case "COUPON_INELIGIBLE", "ZERO_DUE_POLICY_REQUIRED", "TAX_REQUOTE_REQUIRED", "TAX_POLICY_REQUIRED":
			fail(w, 422, pg.Message)
			return
		case "QUOTE_CHANGED", "QUOTE_REQUIRED", "OFFER_CHANGED":
			fail(w, 409, pg.Message)
			return
		case "IDEMPOTENCY_CONFLICT":
			fail(w, 409, pg.Message)
			return
		}
		if pg.Code == "42501" {
			fail(w, 403, "FORBIDDEN")
			return
		}
	}
	billingMapped(w, err)
}

// Coupon application only. This endpoint never creates/binds purchase intents,
// issues invoices, accepts a client price, or invokes trusted reconciliation.
func (s *Service) HandleSubscriptionCouponQuote(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil {
		fail(w, 503, "COUPON_UNAVAILABLE")
		return
	}
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
 if r.Method == http.MethodPost && (r.Header.Get("Origin") == "" || !originAllowed(r)) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	cookie, err := r.Cookie("ekmivo-session")
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	iid := r.PathValue("intentID")
	if !uuidPattern.MatchString(iid) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if r.Method == http.MethodGet {
		var raw []byte
		err = s.Auth.DB.QueryRowContext(r.Context(), "SELECT platform_subscription_coupon_current_quote($1::uuid,$2::uuid)", actor.UserID, iid).Scan(&raw)
		if err != nil {
			subscriptionCouponError(w, err)
			return
		}
		var data any
		if json.Unmarshal(raw, &data) != nil {
			fail(w, 503, "COUPON_UNAVAILABLE")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		write(w, 200, data)
		return
	}
	var b struct {
		OperationKey string  `json:"operation_key"`
		Revision     int64   `json:"revision"`
		Code         *string `json:"coupon_code"`
	}
	if decodeBounded(w, r, &b, 2048) != nil || !uuidPattern.MatchString(b.OperationKey) || b.Revision < 1 || b.Code == nil || len(*b.Code) > 64 {
		fail(w, 422, "INVALID_COUPON_REQUEST")
		return
	}
	var raw []byte
	err = s.Auth.DB.QueryRowContext(r.Context(), "SELECT platform_subscription_coupon_quote($1::uuid,$2::uuid,$3::uuid,$4,$5)", actor.UserID, iid, b.OperationKey, b.Revision, *b.Code).Scan(&raw)
	if err != nil {
		subscriptionCouponError(w, err)
		return
	}
	var data any
	if json.Unmarshal(raw, &data) != nil {
		fail(w, 503, "COUPON_UNAVAILABLE")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	write(w, 200, data)
}

func (s *Service) HandleSubscriptionCouponsAdmin(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil {
		fail(w, 503, "COUPON_UNAVAILABLE")
		return
	}
	cookie, err := r.Cookie("ekmivo-session")
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	if _, err = s.Auth.AuthorizePlatform(r.Context(), actor, true); err != nil {
		authError(w, err)
		return
	}
	operation := "list"
	payload := json.RawMessage(`{}`)
	if r.Method == http.MethodGet {
		q := r.URL.Query()
		p := map[string]string{"query": q.Get("q"), "status": q.Get("status"), "offset": q.Get("offset")}
		if p["status"] == "" {
			p["status"] = "all"
		}
		if p["offset"] == "" {
			p["offset"] = "0"
		}
		payload, _ = json.Marshal(p)
	} else if r.Method == http.MethodPost {
		if r.Header.Get("Origin") == "" || !originAllowed(r) {
			fail(w, 403, "ORIGIN_DENIED")
			return
		}
		var b struct {
			Operation string          `json:"operation"`
			Payload   json.RawMessage `json:"payload"`
		}
		if decodeBounded(w, r, &b, 18000) != nil {
			fail(w, 422, "INVALID_COUPON_REQUEST")
			return
		}
		if b.Operation != "save" && b.Operation != "transition" {
			fail(w, 422, "INVALID_COUPON_REQUEST")
			return
		}
		operation = b.Operation
		payload = b.Payload
	} else {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	var raw []byte
	err = s.Auth.DB.QueryRowContext(r.Context(), "SELECT platform_subscription_coupon_admin($1::uuid,$2,$3::jsonb)", actor.UserID, operation, string(payload)).Scan(&raw)
	if err != nil {
		subscriptionCouponError(w, err)
		return
	}
	var data any
	if json.Unmarshal(raw, &data) != nil {
		fail(w, 503, "COUPON_UNAVAILABLE")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	write(w, 200, data)
}
