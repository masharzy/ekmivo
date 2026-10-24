package checkout

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgconn"
)

// Phase 5 is a browser-session-bound quotation and legal acceptance boundary.
// All write flags remain off until preceding phases and the payment adapter pass.
func subscriptionMutationEnabled(action string) bool {
	if action == "quote" {
		return os.Getenv("EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED") == "true"
	}
	return action == "confirm" && os.Getenv("EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED") == "true" &&
		os.Getenv("EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED") == "true"
}

func subscriptionOrderError(w http.ResponseWriter, err error) {
	var pg *pgconn.PgError
	if !errors.As(err, &pg) {
		fail(w, 503, "ORDER_SERVICE_UNAVAILABLE")
		return
	}
	allowed := map[string]int{
		"ORDER_NOT_FOUND": 404, "ACCESS_DENIED": 403, "STORE_CHANGED": 403,
		"INVALID_ORDER_REQUEST": 422, "COUPON_INVALID": 422, "COUPON_EXPIRED": 409,
		"COUPON_EXHAUSTED": 409, "COUPON_INELIGIBLE": 409, "ORDER_EXPIRED": 409,
		"PRICE_CHANGED": 409, "PLAN_CHANGED": 409, "QUOTE_STALE": 409, "POLICY_CHANGED": 409,
		"POLICY_UNAVAILABLE": 409, "POLICY_ACCEPTANCE_REQUIRED": 422, "ORDER_CONFIRMED": 409,
		"TAX_NOT_CONFIGURED": 503, "FULFILLMENT_NOT_READY": 503, "UPGRADE_REQUOTE_REQUIRED": 409,
		"ZERO_DUE_UNAPPROVED": 409, "INVALID_IDEMPOTENCY_KEY": 422, "IDEMPOTENCY_CONFLICT": 409,
		"AMOUNT_OUT_OF_RANGE": 422,
	}
	if status, ok := allowed[pg.Message]; ok {
		fail(w, status, pg.Message)
		return
	}
	switch pg.Code {
	case "42501":
		fail(w, 403, "ACCESS_DENIED")
	case "40001", "23505":
		fail(w, 409, "ORDER_CHANGED")
	default:
		fail(w, 503, "ORDER_SERVICE_UNAVAILABLE")
	}
}

func (s *Service) HandleSubscriptionOrder(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil {
		fail(w, 503, "ORDER_SERVICE_UNAVAILABLE")
		return
	}
	intent := r.PathValue("intentID")
	if !uuidPattern.MatchString(intent) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	operation := "read"
	if r.Method == http.MethodPost {
		operation = r.PathValue("orderAction")
		if operation != "quote" && operation != "confirm" {
			fail(w, 404, "NOT_FOUND")
			return
		}
		// Cookie-authenticated browser mutations must NOT share the legacy
		// server-to-server exemption for requests with no Origin.
		if r.Header.Get("Origin") == "" || !originAllowed(r) {
			fail(w, 403, "ORIGIN_DENIED")
			return
		}
		if !subscriptionMutationEnabled(operation) ||
			(operation == "confirm" && os.Getenv("EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED") != "true") {
			fail(w, 503, "ORDER_CHECKOUT_NOT_RELEASED")
			return
		}
	} else if r.Method != http.MethodGet {
		fail(w, 405, "METHOD_NOT_ALLOWED")
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
	workspace := r.PathValue("workspaceID")
	if !uuidPattern.MatchString(workspace) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	request := map[string]any{}
	if operation != "read" {
		if decodeBounded(w, r, &request, 4096) != nil || request == nil {
			fail(w, 422, "INVALID_ORDER_REQUEST")
			return
		}
	}
	if operation == "confirm" {
		key := r.Header.Get("Idempotency-Key")
		if !keyPattern.MatchString(key) {
			fail(w, 422, "INVALID_IDEMPOTENCY_KEY")
			return
		}
		request["idempotency_key"] = key
	}
	body, err := json.Marshal(request)
	if err != nil {
		fail(w, 422, "INVALID_ORDER_REQUEST")
		return
	}
	var raw []byte
	err = s.Auth.DB.QueryRowContext(r.Context(),
		"SELECT platform_subscription_order_request($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb)",
		workspace, actor.UserID, intent, operation, string(body)).Scan(&raw)
	if err != nil {
		subscriptionOrderError(w, err)
		return
	}
	if operation == "read" {
		var data map[string]any
		if json.Unmarshal(raw, &data) != nil || data == nil {
			fail(w, 503, "ORDER_SERVICE_UNAVAILABLE")
			return
		}
		data["checkout_enabled"] = subscriptionMutationEnabled("confirm") &&
			os.Getenv("EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED") == "true"
		write(w, 200, data)
		return
	}
	// Phase 5 issues/resumes the immutable control invoice only. Phase 6
	// independently binds that invoice to the system receiving workspace,
	// verifies approved sources and creates/resumes the financial capability.
	// Never issue a second pg10_intent here: two services must not own payment.
	write(w, 200, json.RawMessage(raw))
}
