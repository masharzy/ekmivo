package checkout

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"net/http"
	"time"
)

func (s *Service) billingAllowsNew(ctx context.Context, workspace, realm string) bool {
	if realm == "sandbox" {
		return true
	}
	if realm != "live" || s == nil || s.Auth == nil {
		return false
	}
	var system bool
	if s.Auth.DB.QueryRowContext(ctx, "SELECT platform_billing_system_workspace($1::uuid)", workspace).Scan(&system) == nil && system {
		return true
	}
	var allowed bool
	err := s.Auth.DB.QueryRowContext(ctx, "SELECT pg13_billing_allowed($1::uuid)", workspace).Scan(&allowed)
	return err == nil && allowed
}

func (s *Service) HandleBilling(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil {
		fail(w, 503, "BILLING_UNAVAILABLE")
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
	var raw []byte
	if r.Method == "GET" {
		if r.PathValue("billingAction") == "limits" {
			s.billingResourceLimits(w, r, ws, actor.UserID)
			return
		}
		e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_billing_read($1::uuid,$2::uuid)", ws, actor.UserID).Scan(&raw)
		if e != nil {
			mapped(w, e)
			return
		}
		if r.PathValue("billingAction") == "usage" {
			s.billingUsage(w, r, ws, raw)
			return
		}
		d, usageErr := s.attachPlanUsage(r.Context(), ws, raw)
		if usageErr != nil {
			fail(w, 503, "PLAN_USAGE_UNAVAILABLE")
			return
		}
		write(w, 200, d)
		return
	}
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	// GET is available to all current members. Creating an invoice and
	// reconciling verified platform payments are manager-only mutations.
	// Authorization must be performed before probing a platform receipt.
	var role string
	e = s.Auth.DB.QueryRowContext(r.Context(), `
 SELECT m.role FROM workspace_members m
 JOIN app_users u ON u.id=m.user_id
 WHERE m.workspace_id=$1::uuid AND m.user_id=$2::uuid AND u.disabled_at IS NULL
 LIMIT 1`, ws, actor.UserID).Scan(&role)
	if errors.Is(e, sql.ErrNoRows) || e == nil && role != "owner" && role != "admin" {
		fail(w, 403, "ACCESS_DENIED")
		return
	}
	if e != nil {
		fail(w, 503, "BILLING_UNAVAILABLE")
		return
	}
	if s.Auth.GranularGrants {
		var allowed sql.NullBool
		e = s.Auth.DB.QueryRowContext(r.Context(),
			"SELECT pg13_capability_override($1::uuid,$2::uuid,'workspace:settings')",
			ws, actor.UserID).Scan(&allowed)
		if e != nil {
			fail(w, 503, "BILLING_UNAVAILABLE")
			return
		}
		if allowed.Valid && !allowed.Bool {
			fail(w, 403, "ACCESS_DENIED")
			return
		}
	}
	// Free activation requires no receiving account, paid invoice or external checkout.
	if r.PathValue("billingAction") == "free" {
		var b struct {
			Plan string `json:"plan_id"`
		}
		if decodeBounded(w, r, &b, 1024) != nil {
			fail(w, 422, "INVALID_BILLING_REQUEST")
			return
		}
		e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT payment_plan_claim_free($1::uuid,$2::uuid,$3)", ws, actor.UserID, b.Plan).Scan(&raw)
		if e != nil {
			mapped(w, e)
			return
		}
		var d any
		_ = json.Unmarshal(raw, &d)
		write(w, 200, d)
		return
	}

	if action := r.PathValue("billingAction"); action == "quote" || action == "schedule" || action == "undo" {
		var b struct {
			Plan   string `json:"plan_id"`
			Cycles int    `json:"cycles"`
		}
		if decodeBounded(w, r, &b, 1024) != nil {
			fail(w, 422, "INVALID_BILLING_REQUEST")
			return
		}
		if action == "quote" {
			if b.Cycles == 0 {
				b.Cycles = 1
			}
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT dashboard_billing_quote($1::uuid,$2::uuid,$3,$4)", ws, actor.UserID, b.Plan, b.Cycles).Scan(&raw)
		} else {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT dashboard_billing_change($1::uuid,$2::uuid,$3,$4)", ws, actor.UserID, b.Plan, action == "undo").Scan(&raw)
		}
		if e != nil {
			mapped(w, e)
			return
		}
		write(w, 200, json.RawMessage(raw))
		return
	}
	if r.PathValue("billingAction") != "" && r.PathValue("billingAction") != "reconcile" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var configured sql.NullString
	if s.Auth.DB.QueryRowContext(r.Context(), "SELECT platform_billing_workspace()").Scan(&configured) != nil {
		fail(w, 503, "PLATFORM_RECEIVING_UNAVAILABLE")
		return
	}
	platform := configured.String
	if !s.pipelineReady() || s.Pipeline.Live == nil || !uuidPattern.MatchString(platform) || platform == ws {
		fail(w, 503, "PLATFORM_RECEIVING_UNAVAILABLE")
		return
	}
	// Read itself verifies current membership before any invoice lookup or reconcile.
	e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_billing_read($1::uuid,$2::uuid)", ws, actor.UserID).Scan(&raw)
	if e != nil {
		mapped(w, e)
		return
	}
	var invoice struct {
		ID     string `json:"id"`
		Amount int64  `json:"amount_minor"`
		Status string `json:"status"`
	}
	if r.PathValue("billingAction") == "reconcile" {
		id := r.PathValue("invoiceID")
		var history struct {
			Invoices []struct {
				ID     string `json:"id"`
				Amount int64  `json:"amount_minor"`
				Status string `json:"status"`
			} `json:"invoices"`
		}
		_ = json.Unmarshal(raw, &history)
		for _, i := range history.Invoices {
			if i.ID == id {
				invoice = i
			}
		}
		if invoice.ID == "" {
			fail(w, 404, "NOT_FOUND")
			return
		}
		var receiver sql.NullString
		if s.Auth.DB.QueryRowContext(r.Context(), "SELECT platform_billing_invoice_receiver($1::uuid,$2::uuid)", ws, invoice.ID).Scan(&receiver) != nil || !uuidPattern.MatchString(receiver.String) {
			fail(w, 503, "PLATFORM_RECEIVING_UNAVAILABLE")
			return
		}
		platform = receiver.String
		cap := s.token(platform, "live", "billing:"+invoice.ID)
		var proofRaw []byte
		e = s.Pipeline.Live.QueryRow(r.Context(), "SELECT pg13_platform_payment($1)", digest(cap)).Scan(&proofRaw)
		var proof struct {
			ID          string    `json:"id"`
			Method      string    `json:"method"`
			PayerSuffix string    `json:"payer_suffix"`
			Amount      int64     `json:"amount_minor"`
			Workspace   string    `json:"workspace_id"`
			At          time.Time `json:"verified_at"`
		}
		_ = json.Unmarshal(proofRaw, &proof)
		if e != nil || proof.Workspace != platform || proof.Amount != invoice.Amount || !uuidPattern.MatchString(proof.ID) {
			fail(w, 409, "VERIFIED_PLATFORM_PAYMENT_REQUIRED")
			return
		}
		var saved bool
		e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT dashboard_billing_verified($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7)", ws, invoice.ID, proof.ID, proof.Amount, proof.At, proof.Method, proof.PayerSuffix).Scan(&saved)
		if e != nil {
			mapped(w, e)
			return
		}
		write(w, 200, map[string]any{"renewed": saved})
		return
	}
	// Reject unavailable destinations before issuing a merchant invoice.
	var sourcesRaw []byte
	if err := s.pipelineScoped(r.Context(), platform, "live", func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg10_public_payment_sources($1::uuid,'live')", platform).Scan(&sourcesRaw)
	}); err != nil {
		fail(w, 503, "PLATFORM_RECEIVING_UNAVAILABLE")
		return
	}
	var sources struct {
		Methods []string          `json:"configured_methods"`
		Sources []json.RawMessage `json:"sources"`
	}
	if json.Unmarshal(sourcesRaw, &sources) != nil || len(sources.Methods) == 0 || len(sources.Sources) == 0 {
		fail(w, 503, "PLATFORM_RECEIVING_UNAVAILABLE")
		return
	}
	var b struct {
		Plan    string `json:"plan_id"`
		QuoteID string `json:"quote_id"`
	}
	key := r.Header.Get("Idempotency-Key")
	if decodeBounded(w, r, &b, 1024) != nil || !keyPattern.MatchString(key) {
		fail(w, 422, "INVALID_BILLING_REQUEST")
		return
	}
	if b.QuoteID == "" {
		e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT dashboard_billing_quote($1::uuid,$2::uuid,$3,1)", ws, actor.UserID, b.Plan).Scan(&raw)
		if e != nil {
			mapped(w, e)
			return
		}
		var q struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(raw, &q)
		b.QuoteID = q.ID
	}
	if !uuidPattern.MatchString(b.QuoteID) {
		fail(w, 422, "INVALID_BILLING_REQUEST")
		return
	}
	e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT dashboard_billing_issue($1::uuid,$2::uuid,$3::uuid,$4)", ws, actor.UserID, b.QuoteID, key).Scan(&raw)
	if e != nil {
		mapped(w, e)
		return
	}
	_ = json.Unmarshal(raw, &invoice)
	var pinned sql.NullString
	if s.Auth.DB.QueryRowContext(r.Context(), "SELECT platform_billing_invoice_receiver($1::uuid,$2::uuid)", ws, invoice.ID).Scan(&pinned) != nil || !uuidPattern.MatchString(pinned.String) {
		fail(w, 503, "PLATFORM_RECEIVING_UNAVAILABLE")
		return
	}
	platform = pinned.String
	cap := s.token(platform, "live", "billing:"+invoice.ID)
	e = s.creationScoped(r.Context(), platform, "live", func(tx pgx.Tx) error {
		var result []byte
		return tx.QueryRow(r.Context(), "SELECT pg10_intent($1::uuid,'live',$2,$3,60,$4,$5,$6)", platform, "SAAS-"+invoice.ID, invoice.Amount, "billing:"+invoice.ID, digest(cap), digest(invoice.ID)).Scan(&result)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	write(w, 201, map[string]any{"invoice_id": invoice.ID, "checkout_token": cap, "amount_minor": invoice.Amount, "currency": "BDT"})
}

// Usage is authorized by pg13_billing_read before querying the isolated Live realm.
func (s *Service) billingUsage(w http.ResponseWriter, r *http.Request, ws string, raw []byte) {
	var data struct {
		Effective struct {
			Start string `json:"period_start"`
			End   string `json:"period_end"`
			Terms struct {
				Quota string `json:"quota_period"`
			} `json:"terms"`
		} `json:"effective"`
	}
	if json.Unmarshal(raw, &data) != nil {
		fail(w, 503, "BILLING_USAGE_UNAVAILABLE")
		return
	}
	start, err := time.Parse(time.RFC3339Nano, data.Effective.Start)
	end, endErr := time.Parse(time.RFC3339Nano, data.Effective.End)
	if err != nil || endErr != nil || !end.After(start) {
		fail(w, 409, "SUBSCRIPTION_REQUIRED")
		return
	}
	if r.URL.Query().Get("period") == "previous" {
		if data.Effective.Terms.Quota == "calendar" {
			location, _ := time.LoadLocation("Asia/Dhaka")
			end = start
			start = start.In(location).AddDate(0, -1, 0)
		} else {
			length := end.Sub(start)
			end = start
			start = start.Add(-length)
		}
	} else if p := r.URL.Query().Get("period"); p != "" && p != "current" {
		fail(w, 422, "INVALID_USAGE_PERIOD")
		return
	}
	var usage []byte
	err = s.scoped(r.Context(), ws, "live", func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT dashboard_billing_usage($1::uuid,'live',$2,$3)", ws, start, end).Scan(&usage)
	})
	if err != nil {
		mapped(w, err)
		return
	}
	write(w, 200, json.RawMessage(usage))
}

// Observability is bounded and cannot delay or change payment verification.
// Usage exposes when recording began rather than inventing historical checks.
func (s *Service) recordCheckoutCheck(ws, realm, id string) {
	if !uuidPattern.MatchString(ws) || !uuidPattern.MatchString(id) || realm != "live" {
		return
	}
	select {
	case activitySlots <- struct{}{}:
	default:
		return
	}
	go func() {
		defer func() { <-activitySlots }()
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.scoped(ctx, ws, realm, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, "SELECT dashboard_record_checkout_check($1::uuid,$2,$3::uuid)", ws, realm, id)
			return err
		})
	}()
}
