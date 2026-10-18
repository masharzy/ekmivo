package checkout

import (
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"net/http"
)

// The aggregate SQL authenticates membership before returning any plan or counts.
func (s *Service) billingResourceLimits(w http.ResponseWriter, r *http.Request, ws, actor string) {
	realm := explicitRealm(r)
	if r.URL.Query().Get("environment") == "" {
		realm = "live"
	}
	if realm == "" {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	var control []byte
	if err := s.Auth.DB.QueryRowContext(r.Context(), "SELECT payment_plan_member_resource_usage($1::uuid,$2::uuid)", actor, ws).Scan(&control); err != nil {
		mapped(w, err)
		return
	}
	resources := map[string]any{}
	if json.Unmarshal(control, &resources) != nil {
		fail(w, 503, "PLAN_USAGE_UNAVAILABLE")
		return
	}
	var system bool
	if err := s.Auth.DB.QueryRowContext(r.Context(), "SELECT platform_billing_system_workspace($1::uuid)", ws).Scan(&system); err != nil {
		mapped(w, err)
		return
	}
	var financial []byte
	if resources["payments_enabled"] == true {
		if err := s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT payment_plan_resource_usage($1::uuid,$2)", ws, realm).Scan(&financial)
		}); err != nil {
			fail(w, 503, "PLAN_USAGE_UNAVAILABLE")
			return
		}
		counts := map[string]any{}
		if json.Unmarshal(financial, &counts) != nil {
			fail(w, 503, "PLAN_USAGE_UNAVAILABLE")
			return
		}
		for k, v := range counts {
			resources[k] = v
		}
	}
	var raw []byte
	if err := s.Auth.DB.QueryRowContext(r.Context(), "SELECT jsonb_build_object('effective',payment_plan_effective($1::uuid))", ws).Scan(&raw); err != nil {
		mapped(w, err)
		return
	}
	data, err := s.attachPlanUsage(r.Context(), ws, raw)
	if err != nil {
		fail(w, 503, "PLAN_USAGE_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]any{"effective": data["effective"], "usage": data["usage"], "usage_error": data["usage_error"], "resources": resources, "exempt": system || resources["payments_enabled"] != true})
}
