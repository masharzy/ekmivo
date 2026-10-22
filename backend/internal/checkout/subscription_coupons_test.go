package checkout

import (
	"github.com/jackc/pgx/v5/pgconn"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSubscriptionCouponErrorsDoNotLeakDatabaseDetails(t *testing.T) {
	for _, tc := range []struct {
		message, code string
		status        int
	}{
		{"COUPON_INELIGIBLE", "23514", 422}, {"ZERO_DUE_POLICY_REQUIRED", "23514", 422},
		{"TAX_REQUOTE_REQUIRED", "23514", 422}, {"QUOTE_CHANGED", "40001", 409},
		{"IDEMPOTENCY_CONFLICT", "23505", 409}, {"private database detail", "42501", 403},
	} {
		t.Run(tc.message, func(t *testing.T) {
			w := httptest.NewRecorder()
			subscriptionCouponError(w, &pgconn.PgError{Code: tc.code, Message: tc.message})
			if w.Code != tc.status {
				t.Fatalf("got %d expected %d", w.Code, tc.status)
			}
			if strings.Contains(w.Body.String(), "private database detail") {
				t.Fatal("database detail leaked")
			}
		})
	}
}
func TestSubscriptionCouponHandlersFailClosedWithoutAuthRuntime(t *testing.T) {
	s := &Service{}
	for _, handler := range []func(*httptest.ResponseRecorder){
		func(w *httptest.ResponseRecorder) {
			s.HandleSubscriptionCouponQuote(w, httptest.NewRequest("POST", "/v1/platform/purchase-intents/unknown/quote", strings.NewReader(`{"paid":true,"amount_minor":1}`)))
		},
		func(w *httptest.ResponseRecorder) {
			s.HandleSubscriptionCouponsAdmin(w, httptest.NewRequest("POST", "/v1/admin/billing/coupons", strings.NewReader(`{"operation":"save"}`)))
		},
	} {
		w := httptest.NewRecorder()
		handler(w)
		if w.Code != 503 {
			t.Fatalf("missing authorization runtime returned %d", w.Code)
		}
	}
}
