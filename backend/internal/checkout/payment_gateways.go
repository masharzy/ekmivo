package checkout

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Payment gateways, Phase 1 of payment automation (owner decision 2026-11-26).
// A gateway is a provider and a type (personal, agent, merchant ...) with the
// shop's display name, limits, discount and charge. All rules and all money
// arithmetic live in the database (0272); this handler only checks access and
// passes values through. Nothing else reads gateways yet: checkout and matching
// are unchanged.
//
//	GET   /v1/workspaces/{ws}/payment-providers?environment=live
//	GET   /v1/workspaces/{ws}/gateways?environment=live
//	POST  /v1/workspaces/{ws}/gateways                      create
//	POST  /v1/workspaces/{ws}/gateways/reorder              {"ids":[...]} (route .../gateways/{action})
//	PATCH /v1/workspaces/{ws}/gateways/{id}                 {"version":n,"gateway":{...}}
//	GET   /v1/workspaces/{ws}/gateways/{id}/quote?amount_minor=n
//	POST  /v1/workspaces/{ws}/gateways/{id}/{status|duplicate|delete}
//	GET   /v1/workspaces/{ws}/gateways/{id}/accounts?amount_minor=n   numbers, limits, usage (Phase 2)
//	GET   /v1/workspaces/{ws}/gateways/{id}/next-account?amount_minor=n  which number turns next
//	POST  /v1/workspaces/{ws}/gateway-accounts/{account}/assign      {"gateway_id":"..."}
//	POST  /v1/workspaces/{ws}/gateway-accounts/{account}/limits      {"limits":{...}}
//	GET   /v1/workspaces/{ws}/payment-reviews?state=open             Pending money (Phase 3a)
//	POST  /v1/workspaces/{ws}/payment-reviews/{review}/approve       {"intent_id":"..."} (empty = suggested)
//	POST  /v1/workspaces/{ws}/payment-reviews/{review}/reject        {"reason":"..."}
//
// Reading needs payments:read. Changes need a signed-in owner or admin
// (payments:manage), like phones and receiving accounts.
func paymentGatewaysEnabled() bool {
	return os.Getenv("BRIOFOLD_PAYMENT_GATEWAYS_ENABLED") == "true"
}

type gatewayChange struct {
	Version   int64           `json:"version"`
	GatewayID string          `json:"gateway_id"`
	IntentID  string          `json:"intent_id"`
	Reason    string          `json:"reason"`
	Limits    json.RawMessage `json:"limits"`
	Status    string          `json:"status"`
	IDs       []string        `json:"ids"`
	Gateway   json.RawMessage `json:"gateway"`
}

func (s *Service) HandlePaymentGateways(w http.ResponseWriter, r *http.Request) {
	if !paymentGatewaysEnabled() || !s.ready() {
		fail(w, 404, "NOT_FOUND")
		return
	}
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !uuidPattern.MatchString(ws) || realm == "" {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	id, action, account, review := r.PathValue("gatewayID"), r.PathValue("action"), r.PathValue("accountID"), r.PathValue("reviewID")
	if id != "" && !uuidPattern.MatchString(id) || account != "" && !uuidPattern.MatchString(account) ||
		review != "" && !uuidPattern.MatchString(review) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	read := r.Method == "GET"
	if !read && !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if err := s.pipelineSession(r, ws, realm, !read); err != nil {
		authError(w, err)
		return
	}
	if !s.budget(w, "gateways:"+ws+":"+r.Method, 240) {
		return
	}
	var body gatewayChange
	if !read {
		d := json.NewDecoder(io.LimitReader(r.Body, 16384))
		d.DisallowUnknownFields()
		if err := d.Decode(&body); err != nil && !errors.Is(err, io.EOF) {
			fail(w, 422, "INVALID_REQUEST")
			return
		}
	}
	gateway := []byte(body.Gateway)
	if len(gateway) == 0 {
		gateway = []byte("{}")
	}
	var raw []byte
	err := s.scoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		ctx := r.Context()
		switch {
		case read && strings.HasSuffix(r.URL.Path, "/payment-reviews"):
			return tx.QueryRow(ctx, "SELECT briofold_review_list($1::uuid,$2,$3)", ws, realm, r.URL.Query().Get("state")).Scan(&raw)
		case r.Method == "POST" && review != "" && action == "approve":
			var intent any
			if body.IntentID != "" {
				if !uuidPattern.MatchString(body.IntentID) {
					return errGatewayInput
				}
				intent = body.IntentID
			}
			return tx.QueryRow(ctx, "SELECT briofold_review_approve($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, review, intent).Scan(&raw)
		case r.Method == "POST" && review != "" && action == "reject":
			return tx.QueryRow(ctx, "SELECT briofold_review_reject($1::uuid,$2,$3::uuid,$4)", ws, realm, review, body.Reason).Scan(&raw)
		case read && strings.HasSuffix(r.URL.Path, "/payment-providers"):
			return tx.QueryRow(ctx, "SELECT briofold_provider_list()").Scan(&raw)
		case read && id == "":
			return tx.QueryRow(ctx, "SELECT briofold_gateway_list($1::uuid,$2)", ws, realm).Scan(&raw)
		case read && action == "quote":
			amount, e := strconv.ParseInt(r.URL.Query().Get("amount_minor"), 10, 64)
			if e != nil {
				return errGatewayInput
			}
			return tx.QueryRow(ctx, "SELECT briofold_gateway_quote($1::uuid,$2,$3::uuid,$4)", ws, realm, id, amount).Scan(&raw)
		case read && (action == "accounts" || action == "next-account"):
			var amount any
			if q := r.URL.Query().Get("amount_minor"); q != "" || action == "next-account" {
				n, e := strconv.ParseInt(q, 10, 64)
				if e != nil {
					return errGatewayInput
				}
				amount = n
			}
			fn := "briofold_gateway_accounts"
			if action == "next-account" {
				fn = "briofold_gateway_pick_account"
			}
			return tx.QueryRow(ctx, "SELECT "+fn+"($1::uuid,$2,$3::uuid,$4)", ws, realm, id, amount).Scan(&raw)
		case r.Method == "POST" && account != "" && action == "assign":
			if !uuidPattern.MatchString(body.GatewayID) {
				return errGatewayInput
			}
			return tx.QueryRow(ctx, "SELECT briofold_account_assign($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, account, body.GatewayID).Scan(&raw)
		case r.Method == "POST" && account != "" && action == "limits":
			limits := []byte(body.Limits)
			if len(limits) == 0 {
				limits = []byte("{}")
			}
			return tx.QueryRow(ctx, "SELECT briofold_account_set_limits($1::uuid,$2,$3::uuid,$4::jsonb)", ws, realm, account, limits).Scan(&raw)
		case r.Method == "POST" && id == "" && account == "" && review == "" && action == "reorder":
			return tx.QueryRow(ctx, "SELECT briofold_gateway_reorder($1::uuid,$2,$3::uuid[])", ws, realm, body.IDs).Scan(&raw)
		case r.Method == "POST" && id == "" && account == "" && review == "" && action == "":
			return tx.QueryRow(ctx, "SELECT briofold_gateway_save($1::uuid,$2,NULL,$3::jsonb,NULL)", ws, realm, gateway).Scan(&raw)
		case r.Method == "PATCH" && id != "" && action == "":
			return tx.QueryRow(ctx, "SELECT briofold_gateway_save($1::uuid,$2,$3::uuid,$4::jsonb,$5)", ws, realm, id, gateway, body.Version).Scan(&raw)
		case r.Method == "POST" && id != "" && (action == "status" || action == "duplicate" || action == "delete"):
			var status, version any
			if action != "duplicate" {
				version = body.Version
			}
			if action == "status" {
				status = body.Status
			}
			return tx.QueryRow(ctx, "SELECT briofold_gateway_action($1::uuid,$2,$3::uuid,$4,$5,$6)", ws, realm, id, action, status, version).Scan(&raw)
		default:
			return errMethod
		}
	})
	switch {
	case err == nil && (len(raw) == 0 || string(raw) == "null"):
		fail(w, 404, "NOT_FOUND")
	case err == nil:
		status := 200
		if r.Method == "POST" && action == "" && account == "" && review == "" || action == "duplicate" {
			status = 201
		}
		write(w, status, json.RawMessage(raw))
	case errors.Is(err, errMethod):
		fail(w, 405, "METHOD_NOT_ALLOWED")
	case errors.Is(err, errGatewayInput):
		fail(w, 422, "INVALID_GATEWAY")
	default:
		if code := gatewayErrorCode(err); code != "" {
			fail(w, gatewayErrorStatus[code], code)
			return
		}
		mapped(w, err)
	}
}

var errGatewayInput = errors.New("invalid gateway input")

var gatewayErrorStatus = map[string]int{"INVALID_GATEWAY": 422, "GATEWAY_VERSION_CONFLICT": 409,
	"GATEWAY_HAS_ACCOUNTS": 409, "REVIEW_DECIDED": 409, "NOT_FOUND": 404}

// gatewayErrorCode turns the fixed 0272 SQLSTATEs into API codes.
func gatewayErrorCode(err error) string {
	var pg *pgconn.PgError
	if !errors.As(err, &pg) {
		return ""
	}
	return map[string]string{"P7201": "INVALID_GATEWAY", "P7202": "GATEWAY_VERSION_CONFLICT",
		"P7203": "GATEWAY_HAS_ACCOUNTS", "P7204": "NOT_FOUND", "P7205": "REVIEW_DECIDED"}[pg.Code]
}
