package checkout

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/masharzy/ekmivo/backend/internal/authz"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// Real Go HTTP/session boundary against the disposable PostgreSQL CI service.
// Never set PHASE5_ORDER_HTTP_TEST_DATABASE_URL to a shared Neon/prod database.
func TestSubscriptionOrderHTTPIsolatedPostgres(t *testing.T) {
	source := os.Getenv("PHASE5_ORDER_HTTP_TEST_DATABASE_URL")
	if source == "" {
		t.Skip("requires isolated Phase 5 CI PostgreSQL")
	}
	u, err := url.Parse(source)
	if err != nil || u.Hostname() != "127.0.0.1" || u.Port() != "5432" || u.Path != "/ekmivo" {
		t.Fatal("Phase 5 HTTP integration refuses a remote or non-disposable database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", source)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var owner, other, store, intent string
	for _, item := range []struct{ query string; destination *string }{
		{"SELECT id::text FROM app_users WHERE email='a@example.invalid'", &owner},
		{"SELECT id::text FROM app_users WHERE email='b@example.invalid'", &other},
		{"SELECT id::text FROM workspaces WHERE name='CI primary'", &store},
	} {
		if err = db.QueryRowContext(ctx, item.query).Scan(item.destination); err != nil {
			t.Fatal(err)
		}
	}
	digestBytes := make([]byte, 32)
	if _, err = rand.Read(digestBytes); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(digestBytes)
	if err = db.QueryRowContext(ctx,
		"INSERT INTO platform_subscription_purchase_intents(actor_id,workspace_id,offer_version_id,public_token_sha256) "+
			"SELECT $1::uuid,$2::uuid,id,$3 FROM platform_subscription_offer_versions "+
			"WHERE offer_key='phase5_ci_plan' AND revision=1 RETURNING platform_subscription_purchase_intents.id::text",
		owner, store, hex.EncodeToString(digest[:])).Scan(&intent); err != nil {
		t.Fatal(err)
	}
	makeSession := func(actor string) string {
		t.Helper()
		secret := make([]byte, 32)
		if _, e := rand.Read(secret); e != nil {
			t.Fatal(e)
		}
		token := base64.RawURLEncoding.EncodeToString(secret)
		digest := sha256.Sum256([]byte(token))
		hash := hex.EncodeToString(digest[:])
		if _, e := db.ExecContext(ctx, "INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1::uuid,$2,now()+interval '1 hour',now())", actor, hash); e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { _, _ = db.ExecContext(context.Background(), "DELETE FROM auth_sessions WHERE token_hash=$1", hash) })
		return token
	}
	ownerToken := makeSession(owner)
	otherToken := makeSession(other)
	service := &Service{Auth: &authz.Repository{DB: db}}
	SetAllowedOrigin("https://phase5-ci.example.invalid")
	t.Cleanup(func() { SetAllowedOrigin("") })
	call := func(method, action, token string, payload any, allowOrigin bool, key string) *httptest.ResponseRecorder {
		t.Helper()
		var raw []byte
		if payload != nil {
			raw, _ = json.Marshal(payload)
		}
		path := "/v1/workspaces/" + store + "/subscription-orders/" + intent
		if action != "" {
			path += "/" + action
		}
		req := httptest.NewRequest(method, "https://phase5-ci.example.invalid"+path, bytes.NewReader(raw))
		req.SetPathValue("workspaceID", store)
		req.SetPathValue("intentID", intent)
		req.SetPathValue("orderAction", action)
		if token != "" {
			req.AddCookie(&http.Cookie{Name: "ekmivo-session", Value: token})
		}
		if allowOrigin {
			req.Header.Set("Origin", "https://phase5-ci.example.invalid")
		}
		if key != "" {
			req.Header.Set("Idempotency-Key", key)
		}
		result := httptest.NewRecorder()
		service.HandleSubscriptionOrder(result, req)
		return result
	}
	expect := func(label string, result *httptest.ResponseRecorder, want int) {
		t.Helper()
		if result.Code != want {
			t.Fatalf("%s: HTTP %d != %d; body=%s", label, result.Code, want, result.Body.String())
		}
	}
	expect("anonymous", call("GET", "", "", nil, false, ""), 401)
	expect("other actor", call("GET", "", otherToken, nil, false, ""), 403)
	expect("owner read", call("GET", "", ownerToken, nil, false, ""), 200)
	expect("POST without Origin", call("POST", "quote", ownerToken, map[string]any{}, false, ""), 403)
	expect("flag-off quote", call("POST", "quote", ownerToken, map[string]any{}, true, ""), 503)
	t.Setenv("EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED", "true")
	expect("owner quote", call("POST", "quote", ownerToken, map[string]any{}, true, ""), 200)
	quoted := call("GET", "", ownerToken, nil, false, "")
	expect("reloaded quote", quoted, 200)
	var snapshot struct {
		Quote struct{ ID string } `json:"quote"`
		Policies map[string]struct{ ID string; SHA256 string } `json:"policies"`
	}
	if err = json.Unmarshal(quoted.Body.Bytes(), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Quote.ID == "" || len(snapshot.Policies) != 3 {
		t.Fatal("HTTP quote lacks three published legal identities or immutable quote ID")
	}
	consents := map[string]any{}
	for kind, policy := range snapshot.Policies {
		consents[kind] = map[string]any{"accepted": true, "id": policy.ID, "sha256": policy.SHA256}
	}
	payload := map[string]any{"quote_id": snapshot.Quote.ID, "consents": consents}
	key := "phase5_http_confirm_0001"
	expect("flags-off confirm", call("POST", "confirm", ownerToken, payload, true, key), 503)
	t.Setenv("EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED", "true")
	t.Setenv("EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED", "true")
	t.Setenv("EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED", "true")
	expect("three consents required", call("POST", "confirm", ownerToken, map[string]any{"quote_id": snapshot.Quote.ID}, true, key), 422)
	first := call("POST", "confirm", ownerToken, payload, true, key)
	expect("one confirmed invoice", first, 200)
	duplicate := call("POST", "confirm", ownerToken, payload, true, key)
	expect("same-key recovery", duplicate, 200)
	var a, b struct{ InvoiceID string `json:"invoice_id"` }
	if err = json.Unmarshal(first.Body.Bytes(), &a); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(duplicate.Body.Bytes(), &b); err != nil {
		t.Fatal(err)
	}
	if a.InvoiceID == "" || a.InvoiceID != b.InvoiceID {
		t.Fatalf("HTTP replay created a duplicate invoice: %q vs %q", a.InvoiceID, b.InvoiceID)
	}
	var invoices int
	if err = db.QueryRowContext(ctx, "SELECT count(*) FROM platform_subscription_order_confirmations WHERE intent_id=$1::uuid", intent).Scan(&invoices); err != nil || invoices != 1 {
		t.Fatalf("expected exactly one confirmed snapshot, count=%d err=%v", invoices, err)
	}
}
