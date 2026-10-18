package checkout

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgconn"
	"net/http/httptest"
	"testing"
)

func TestPlanAdmissionErrorsAreActionable(t *testing.T) {
	for _, tc := range []struct {
		sql, code string
		status    int
	}{
		{"P6902", "PLATFORM_RECEIVING_UNAVAILABLE", 503}, {"P6901", "RECEIVING_ACCOUNT_CONSENT_REQUIRED", 409}, {"P6801", "PLAN_SNAPSHOT_REQUIRED", 503}, {"P6802", "SUBSCRIPTION_REQUIRED", 403},
		{"P6803", "PAYMENT_ALLOWANCE_EXHAUSTED", 403}, {"P6804", "ACTIVE_CHECKOUT_LIMIT", 429},
		{"P6805", "PLAN_RATE_LIMITED", 429}, {"P6806", "PLAN_RESOURCE_LIMIT", 403},
	} {
		t.Run(tc.code, func(t *testing.T) {
			w := httptest.NewRecorder()
			mapped(w, &pgconn.PgError{Code: tc.sql, Message: tc.code})
			if w.Code != tc.status {
				t.Fatalf("status %d", w.Code)
			}
			var body struct {
				Error struct {
					Code string `json:"code"`
				} `json:"error"`
			}
			if json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Error.Code != tc.code {
				t.Fatal("client cannot distinguish upgrade from dependency failure")
			}
			if tc.status == 429 && w.Header().Get("Retry-After") == "" {
				t.Fatal("retry delay missing")
			}
		})
	}
}
func TestSandboxAdmissionDoesNotNeedLiveSubscription(t *testing.T) {
	s := &Service{}
	p, e := s.planSnapshot(context.Background(), "527bf31a-bb41-4d3d-8c7f-9dbe725dc1df", "sandbox")
	if e != nil || p != nil {
		t.Fatal("sandbox must not spend a live payment allowance")
	}
}

func TestReceivingAccountConflictIsDistinctFromOtherConflicts(t *testing.T) {
	for _, tc := range []struct{ constraint, code string }{
		{"financial_exclusive_receiving_identity", "RECEIVING_ACCOUNT_IN_USE"},
		{"other_unique_constraint", "CONFLICT"},
	} {
		w := httptest.NewRecorder()
		mapped(w, &pgconn.PgError{Code: "23505", ConstraintName: tc.constraint})
		var body struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		if json.Unmarshal(w.Body.Bytes(), &body) != nil || w.Code != 409 || body.Error.Code != tc.code {
			t.Fatalf("constraint %s: %d %s", tc.constraint, w.Code, w.Body.String())
		}
	}
}
