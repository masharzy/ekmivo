package checkout

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type keyCheckTransport func(*http.Request) (*http.Response, error)

func (f keyCheckTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestSavedOpenRouterCredentialCheck(t *testing.T) {
	for _, tc := range []struct {
		status           int
		body             string
		valid, wantError bool
	}{
		{200, `{"data":{"usage":0}}`, true, false},
		{401, `{"error":{"message":"private provider details"}}`, false, false},
		{200, `{"data":{}}`, false, true},
		{429, `{}`, false, true},
	} {
		client := &http.Client{Transport: keyCheckTransport(func(r *http.Request) (*http.Response, error) {
			if r.Method != "GET" || r.URL.String() != "https://openrouter.ai/api/v1/key" || r.Header.Get("Authorization") != "Bearer fixture-key" {
				t.Fatal("unexpected credential request")
			}
			return &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body)), Header: http.Header{}}, nil
		})}
		valid, err := checkOpenRouterKey(context.Background(), client, "fixture-key")
		if valid != tc.valid || (err != nil) != tc.wantError {
			t.Fatalf("status %d: valid=%v err=%v", tc.status, valid, err)
		}
	}
}
