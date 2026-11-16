package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFreeAICreditIsOffUntilItsFlagIsOn(t *testing.T) {
	t.Setenv("BRIOFOLD_AI_FREE_CREDIT_ENABLED", "")
	t.Setenv("BRIOFOLD_AI_TOPUPS_ENABLED", "true") // paid top-ups on must not switch free credit on
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/v1/workspaces/00000000-0000-0000-0000-000000000001/ai-credits/free", nil))
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "AI_FREE_CREDIT_NOT_ENABLED") {
		t.Fatalf("flag off: HTTP %d %s", rec.Code, rec.Body.String())
	}
}
