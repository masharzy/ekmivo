package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/masharzy/briofold/backend/internal/servicehealth"
)

func TestServiceStatusIsHiddenWhenFlagIsOff(t *testing.T) {
	t.Setenv("BRIOFOLD_SERVICE_STATUS_ENABLED", "")
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/status/services", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("flag off: HTTP %d, want 404", rec.Code)
	}
}

func TestServiceStatusReportsEveryServiceWithoutGuessing(t *testing.T) {
	t.Setenv("BRIOFOLD_SERVICE_STATUS_ENABLED", "true")
	t.Setenv("PG10_EXTENSIONS_ENABLED", "")
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/status/services", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("HTTP %d, want 200", rec.Code)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("status must not be cached")
	}
	var body struct {
		Services   map[string]string `json:"services"`
		ObservedAt string            `json:"observed_at"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.ObservedAt == "" {
		t.Fatal("observed_at missing")
	}
	if body.Services["payments"] != "down" {
		t.Fatalf("payments without financial readiness: %q, want down", body.Services["payments"])
	}
	for _, name := range []string{"sms", "ai", "chat", "webhooks"} {
		state, ok := body.Services[name]
		if !ok {
			t.Fatalf("service %s missing", name)
		}
		switch state {
		case "operational", "degraded", "down", "unknown":
		default:
			t.Fatalf("service %s has invalid state %q", name, state)
		}
	}
}

func TestObservedCountsOnlyServerErrors(t *testing.T) {
	servicehealth.Enable(servicehealth.SMS, 0)
	serve := func(status int) {
		h := observed(servicehealth.SMS, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) })
		h(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/v1/device/phone-events", nil))
	}
	for i := 0; i < 5; i++ {
		serve(http.StatusUnauthorized) // a bad device signature is not an outage
	}
	if got := servicehealth.Default().State(servicehealth.SMS); got != servicehealth.Operational {
		t.Fatalf("client errors: %s, want operational", got)
	}
	for i := 0; i < 3; i++ {
		serve(http.StatusServiceUnavailable)
	}
	if got := servicehealth.Default().State(servicehealth.SMS); got != servicehealth.Down {
		t.Fatalf("only server errors: %s, want down", got)
	}
	for i := 0; i < 4; i++ {
		serve(http.StatusOK)
	}
	if got := servicehealth.Default().State(servicehealth.SMS); got != servicehealth.Operational {
		t.Fatalf("3 of 7 failed: %s, want operational", got)
	}
}
