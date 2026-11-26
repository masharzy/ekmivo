package checkout

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestPaymentGatewaysFlagOffIsNotFound(t *testing.T) {
	t.Setenv("BRIOFOLD_PAYMENT_GATEWAYS_ENABLED", "")
	for _, c := range []struct{ method, path string }{
		{"GET", "/v1/workspaces/aaaaaaaa-0000-4000-8000-000000000001/gateways?environment=live"},
		{"POST", "/v1/workspaces/aaaaaaaa-0000-4000-8000-000000000001/gateways?environment=live"},
		{"GET", "/v1/workspaces/aaaaaaaa-0000-4000-8000-000000000001/payment-providers?environment=live"},
	} {
		rec := httptest.NewRecorder()
		(&Service{}).HandlePaymentGateways(rec, httptest.NewRequest(c.method, c.path, bytes.NewBufferString(`{}`)))
		if rec.Code != 404 {
			t.Fatalf("%s %s with the flag off must answer 404, got %d", c.method, c.path, rec.Code)
		}
	}
}

func TestPaymentGatewaysNotReadyIsNotFound(t *testing.T) {
	t.Setenv("BRIOFOLD_PAYMENT_GATEWAYS_ENABLED", "true")
	rec := httptest.NewRecorder()
	(&Service{}).HandlePaymentGateways(rec, httptest.NewRequest("GET", "/v1/workspaces/x/gateways", nil))
	if rec.Code != 404 {
		t.Fatalf("service without databases must answer 404, got %d", rec.Code)
	}
}

func TestGatewayErrorCodes(t *testing.T) {
	for state, want := range map[string]string{"P7201": "INVALID_GATEWAY", "P7202": "GATEWAY_VERSION_CONFLICT",
		"P7203": "GATEWAY_HAS_ACCOUNTS", "P7204": "NOT_FOUND", "23505": ""} {
		got := gatewayErrorCode(&pgconn.PgError{Code: state})
		if got != want {
			t.Fatalf("%s: got %q want %q", state, got, want)
		}
		if want != "" && gatewayErrorStatus[want] == 0 {
			t.Fatalf("%s has no HTTP status", want)
		}
	}
	if gatewayErrorCode(errors.New("plain")) != "" {
		t.Fatal("non-database error must not map")
	}
}

// The handler never computes money and never logs request values.
func TestPaymentGatewaysHandlerHasNoMoneyOrLogging(t *testing.T) {
	src, err := os.ReadFile("payment_gateways.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(src)
	for _, banned := range []string{"log.", "fmt.Print", "* 100", "/ 100", "percent_charge_bp *"} {
		if strings.Contains(text, banned) {
			t.Fatalf("payment_gateways.go must not contain %q", banned)
		}
	}
	for _, fn := range []string{"briofold_gateway_list", "briofold_gateway_save", "briofold_gateway_action",
		"briofold_gateway_reorder", "briofold_gateway_quote", "briofold_provider_list"} {
		if !strings.Contains(text, fn) {
			t.Fatalf("handler does not call %s", fn)
		}
	}
}
