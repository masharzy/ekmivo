package checkout

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/masharzy/ekmivo/backend/internal/authz"
)

const subscriptionIntentTestID = "a3f1e65b-21be-4f5e-9c1f-00914557df65"

func TestSubscriptionOrderGatesFailClosed(t *testing.T) {
	t.Setenv("EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED", "false")
	t.Setenv("EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED", "false")
	t.Setenv("EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED", "false")
	if subscriptionMutationEnabled("quote") || subscriptionMutationEnabled("confirm") || subscriptionMutationEnabled("other") {
		t.Fatal("checkout flags must default to closed")
	}
	t.Setenv("EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED", "true")
	if !subscriptionMutationEnabled("quote") || subscriptionMutationEnabled("confirm") {
		t.Fatal("quote must not unlock payment confirmation")
	}
	t.Setenv("EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED", "true")
	if subscriptionMutationEnabled("confirm") {
		t.Fatal("confirmation must require the Phase 6 handoff gate")
	}
	t.Setenv("EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED", "true")
	if !subscriptionMutationEnabled("confirm") {
		t.Fatal("all three independent flags should enable confirmation")
	}
}

func TestSubscriptionOrderRejectsUnauthenticatedMutationsBeforeDB(t *testing.T) {
	svc := &Service{Auth: &authz.Repository{}}
	for _, tc := range []struct {
		method, intent, action, origin string
		want                         int
	}{
		{http.MethodGet, "plan-slug", "", "", http.StatusNotFound},
		{http.MethodPost, subscriptionIntentTestID, "wallet", "https://ekmivo.example", http.StatusNotFound},
		{http.MethodPost, subscriptionIntentTestID, "quote", "", http.StatusForbidden},
		{http.MethodPost, subscriptionIntentTestID, "confirm", "", http.StatusForbidden},
	} {
		request := httptest.NewRequest(tc.method, "http://example.test/v1/order", strings.NewReader("{}"))
		request.SetPathValue("intentID", tc.intent)
		request.SetPathValue("orderAction", tc.action)
		if tc.origin != "" {
			request.Header.Set("Origin", tc.origin)
		}
		response := httptest.NewRecorder()
		svc.HandleSubscriptionOrder(response, request)
		if response.Code != tc.want {
			t.Errorf("%s/%s: got %d, want %d", tc.method, tc.action, response.Code, tc.want)
		}
	}
}

func TestSubscriptionOrderDatabaseErrorsAreAllowlisted(t *testing.T) {
	for _, tc := range []struct {
		code string
		want int
	}{
		{"POLICY_CHANGED", 409}, {"COUPON_EXHAUSTED", 409}, {"QUOTE_STALE", 409},
		{"POLICY_ACCEPTANCE_REQUIRED", 422}, {"STORE_CHANGED", 403},
		{"SENSITIVE_DATABASE_INTERNAL", 503},
	} {
		recorder := httptest.NewRecorder()
		subscriptionOrderError(recorder, &pgconn.PgError{Code: "P0001", Message: tc.code})
		if recorder.Code != tc.want {
			t.Errorf("%s: HTTP %d instead of %d", tc.code, recorder.Code, tc.want)
		}
		if strings.Contains(recorder.Body.String(), "SENSITIVE_DATABASE_INTERNAL") {
			t.Fatal("unexpected database detail leaked")
		}
	}
}
