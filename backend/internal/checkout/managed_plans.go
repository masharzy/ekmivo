package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Only new intent creation needs a current commercial snapshot. Reads, signed
// receipt ingestion, verification and delivery must survive subscription expiry.
func (s *Service) planSnapshot(ctx context.Context, ws, realm string) ([]byte, error) {
	if realm == "sandbox" {
		return nil, nil
	}
	if ws == os.Getenv("PLATFORM_BILLING_WORKSPACE_ID") {
		b, _ := json.Marshal(map[string]any{"workspace_id": ws, "platform_billing": true, "fetched_at": time.Now().UTC()})
		return b, nil
	}
	var installed bool
	if err := s.Auth.DB.QueryRowContext(ctx, "SELECT to_regprocedure('payment_plan_effective(uuid)') IS NOT NULL").Scan(&installed); err != nil {
		return nil, err
	}
	if !installed {
		if !s.billingAllowsNew(ctx, ws, realm) {
			return nil, &pgconn.PgError{Code: "P6802", Message: "SUBSCRIPTION_REQUIRED"}
		}
		return nil, nil
	}
	var raw []byte
	if err := s.Auth.DB.QueryRowContext(ctx, "SELECT payment_plan_effective($1::uuid)", ws).Scan(&raw); err != nil {
		return nil, err
	}
	var p map[string]any
	if json.Unmarshal(raw, &p) != nil || p == nil {
		return nil, errors.New("invalid plan snapshot")
	}
	p["workspace_id"] = ws
	p["fetched_at"] = time.Now().UTC()
	return json.Marshal(p)
}

func (s *Service) creationScoped(ctx context.Context, ws, realm string, fn func(pgx.Tx) error) error {
	snapshot, err := s.planSnapshot(ctx, ws, realm)
	if err != nil {
		return err
	}
	return s.scoped(ctx, ws, realm, func(tx pgx.Tx) error {
		if len(snapshot) > 0 {
			if _, err := tx.Exec(ctx, "SELECT set_config('ekmivo.payment_plan',$1,true)", string(snapshot)); err != nil {
				return err
			}
		}
		return fn(tx)
	})
}

func (s *Service) planFeature(w http.ResponseWriter, r *http.Request, ws, realm, feature string) bool {
	if realm == "sandbox" {
		return true
	}
	var installed bool
	if s.Auth.DB.QueryRowContext(r.Context(), "SELECT to_regprocedure('payment_plan_effective(uuid)') IS NOT NULL").Scan(&installed) != nil {
		fail(w, 503, "PLAN_UNAVAILABLE")
		return false
	}
	if !installed {
		fail(w, 503, "PLAN_UNAVAILABLE")
		return false
	}
	var raw []byte
	if s.Auth.DB.QueryRowContext(r.Context(), "SELECT payment_plan_effective($1::uuid)", ws).Scan(&raw) != nil {
		fail(w, 503, "PLAN_UNAVAILABLE")
		return false
	}
	var p struct {
		Terms struct {
			Features map[string]bool `json:"features"`
		} `json:"terms"`
	}
	if json.Unmarshal(raw, &p) != nil || !p.Terms.Features[feature] {
		fail(w, 403, "PLAN_FEATURE_REQUIRED")
		return false
	}
	return true
}

func (s *Service) attachPlanUsage(ctx context.Context, ws string, raw []byte) (map[string]any, error) {
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	effective, ok := data["effective"].(map[string]any)
	if !ok || effective["period_start"] == nil {
		return data, nil
	}
	var usage []byte
	if err := s.scoped(ctx, ws, "live", func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "SELECT payment_allowance_usage($1::uuid,'live',$2::timestamptz,$3::timestamptz)", ws, effective["period_start"], effective["period_end"]).Scan(&usage)
	}); err != nil {
		data["usage_error"] = true
		return data, nil
	}
	var parsed any
	if err := json.Unmarshal(usage, &parsed); err != nil {
		return nil, err
	}
	data["usage"] = parsed
	return data, nil
}

// Cross-tenant allowance reads require super-admin + MFA, without impersonation.
func (s *Service) HandleAdminPlanUsage(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil {
		fail(w, 503, "PLAN_USAGE_UNAVAILABLE")
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
	ws := r.PathValue("workspaceID")
	if !uuidPattern.MatchString(ws) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var effective json.RawMessage
	if err = s.Auth.DB.QueryRowContext(r.Context(), "SELECT payment_plan_effective($1::uuid)", ws).Scan(&effective); err != nil {
		mapped(w, err)
		return
	}
	raw, _ := json.Marshal(map[string]any{"effective": effective})
	data, err := s.attachPlanUsage(r.Context(), ws, raw)
	if err != nil {
		mapped(w, err)
		return
	}
	resources := map[string]any{}
	var controlResources []byte
	if err := s.Auth.DB.QueryRowContext(r.Context(), "SELECT payment_plan_admin_resource_usage($1::uuid,$2::uuid)", actor.UserID, ws).Scan(&controlResources); err != nil {
		data["resource_usage_error"] = true
	} else {
		if json.Unmarshal(controlResources, &resources) != nil {
			data["resource_usage_error"] = true
		}
	}
	var financialResources []byte
	if err := s.scoped(r.Context(), ws, "live", func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT payment_plan_resource_usage($1::uuid,'live')", ws).Scan(&financialResources)
	}); err != nil {
		data["resource_usage_error"] = true
	} else {
		var counts map[string]any
		if json.Unmarshal(financialResources, &counts) != nil {
			data["resource_usage_error"] = true
		} else {
			for k, v := range counts {
				resources[k] = v
			}
		}
	}
	data["resources"] = resources

	write(w, 200, data)
}
