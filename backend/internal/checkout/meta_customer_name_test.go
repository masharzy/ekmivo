package checkout

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/masharzy/briofold/backend/internal/deviceevidence"
)

func TestMetaInstagramCustomerNameUsesBoundCredential(t *testing.T) {
	key := []byte("01234567890123456789012345678901")
	cipher, err := deviceevidence.Encrypt(key, []byte("fixture-ig-token"), "store|inbox|ig|fixture")
	if err != nil {
		t.Fatal(err)
	}
	svc := Service{Pipeline: &Pipeline{Key: key}}
	job := metaCustomerNameJob{Workspace: "store", Provider: "ig", Account: "fixture", Customer: "1234", Credential: base64.StdEncoding.EncodeToString(cipher)}
	old := inboxHTTP
	t.Cleanup(func() { inboxHTTP = old })
	calls := 0
	inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "graph.facebook.com" || r.URL.Path != "/v25.0/1234" || r.URL.Query().Get("fields") != "name,username" || r.Header.Get("Authorization") != "Bearer fixture-ig-token" {
			t.Fatal("Graph request escaped its configured host, profile or credential")
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"username":"fixture_buyer"}`))}, nil
	})}
	if name := svc.fetchMetaCustomerName(context.Background(), "v25.0", job); name != "fixture_buyer" {
		t.Fatalf("Instagram username fallback returned %q", name)
	}
	job.Workspace = "other-store"
	if name := svc.fetchMetaCustomerName(context.Background(), "v25.0", job); name != "" || calls != 1 {
		t.Fatal("foreign workspace credential was used")
	}
}
