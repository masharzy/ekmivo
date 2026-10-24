package checkout

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func wooTestSignature(secret string, raw []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(raw)
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
func TestWooSignatureUsesExactBytes(t *testing.T) {
	raw := []byte(`{"id":55,"name":"Fictional"}`)
	sig := wooTestSignature("fictional-source-secret", raw)
	if !wooSignature([]byte("fictional-source-secret"), raw, sig) {
		t.Fatal("valid Woo signature rejected")
	}
	for _, sample := range []struct {
		key  string
		body []byte
		sig  string
	}{{"fictional-source-secret", append(append([]byte{}, raw...), ' '), sig}, {"other-source", raw, sig}, {"fictional-source-secret", raw, "bad"}} {
		if wooSignature([]byte(sample.key), sample.body, sample.sig) {
			t.Fatal("tampered webhook accepted")
		}
	}
}
func TestWooControlWebhookSources(t *testing.T) {
	target := os.Getenv("PG_WOO_TEST_CONTROL_URL")
	if target == "" {
		t.Skip("isolated CONTROL fixture not supplied")
	}
	u, err := url.Parse(target)
	if err != nil || !(u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1") || strings.Contains(strings.ToLower(u.Path), "prod") {
		t.Fatal("refusing shared DB")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, target)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var owner, viewer string
	if err = pool.QueryRow(ctx, "SELECT id FROM app_users WHERE disabled_at IS NULL ORDER BY id LIMIT 1").Scan(&owner); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, "SELECT id FROM app_users WHERE disabled_at IS NULL AND id<>$1::uuid ORDER BY id LIMIT 1", owner).Scan(&viewer); err != nil {
		t.Fatal(err)
	}
	must := func(q string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	ws := newUUID()
	must("INSERT INTO workspaces(id,name,service_mode,created_by) VALUES($1,'Fictional Woo hook Store','both',$2)", ws, owner)
	must("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')", ws, owner, viewer)
	t.Setenv("BRIOFOLD_WOO_WEBHOOKS_ENABLED", "true")
	t.Setenv("WOO_WEBHOOK_PUBLIC_ORIGIN", "https://fixture-hooks.example.invalid")
	s := &Service{Pipeline: &Pipeline{Control: pool, Key: bytes.Repeat([]byte{43}, 32)}}
	command := func(actor, action, key string, b map[string]any) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "https://app.example.invalid/commerce", nil)
		s.commerceIntegration(w, r, ws, "live", actor, key, action, b)
		return w
	}
	config := map[string]any{"provider": "woocommerce", "origin": "https://fixture-shop.example.invalid", "api_key": "fictional-consumer-key", "secret": "fictional-consumer-secret"}
	if r := command(owner, "integration-save", newUUID(), config); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	key := newUUID()
	created := command(owner, "woo-hook-create", key, map[string]any{})
	if created.Code != 200 {
		t.Fatal(created.Code, created.Body.String())
	}
	var source struct {
		ID       string `json:"id"`
		Secret   string `json:"signing_secret"`
		Endpoint string `json:"endpoint"`
	}
	if json.Unmarshal(created.Body.Bytes(), &source) != nil || source.Secret == "" || source.Endpoint != "https://fixture-hooks.example.invalid/v1/channels/woocommerce/"+source.ID {
		t.Fatal("invalid source response")
	}
	recovered := command(owner, "woo-hook-create", key, map[string]any{})
	if recovered.Code != 200 || !bytes.Equal(recovered.Body.Bytes(), created.Body.Bytes()) {
		t.Fatal("lost response created a different source", recovered.Code, recovered.Body.String())
	}
	if r := command(viewer, "woo-hook-create", newUUID(), map[string]any{}); r.Code != 403 {
		t.Fatal("viewer created source", r.Code)
	}
	var cipher []byte
	if err = pool.QueryRow(ctx, "SELECT secret_cipher FROM commerce_woo_hook_sources WHERE id=$1", source.ID).Scan(&cipher); err != nil || bytes.Contains(cipher, []byte(source.Secret)) {
		t.Fatal("signing secret stored as plaintext", err)
	}
	ping := httptest.NewRecorder()
	probe := httptest.NewRequest("POST", source.Endpoint, strings.NewReader("webhook_id=55"))
	probe.SetPathValue("sourceID", source.ID)
	probe.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	s.HandleWooWebhook(ping, probe)
	if ping.Code != 200 || !strings.Contains(ping.Body.String(), "\"authenticated\":false") {
		t.Fatal("Woo reachability ping incorrectly authenticated", ping.Code, ping.Body.String())
	}
	var initialCount int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM commerce_woo_hook_events WHERE source_id=$1", source.ID).Scan(&initialCount); err != nil || initialCount != 0 {
		t.Fatal("unsigned ping persisted a notice", err)
	}
	body := []byte(`{"id":55,"name":"Fictional signed stale product","type":"simple","sku":"UNTRUSTED-PAYLOAD-SKU","price":"0.01","customer":{"email":"private-must-not-be-retained@example.invalid"}}`)
	receive := func(raw []byte, delivery, signature string) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", source.Endpoint, bytes.NewReader(raw))
		r.SetPathValue("sourceID", source.ID)
		r.Header.Set("X-WC-Webhook-Signature", signature)
		r.Header.Set("X-WC-Webhook-Delivery-ID", delivery)
		r.Header.Set("X-WC-Webhook-Topic", "order.deleted")
		s.HandleWooWebhook(w, r)
		return w
	}
	if r := receive(body, "fictional-delivery", wooTestSignature(source.Secret, body)); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	var eventID string
	if err = pool.QueryRow(ctx, "SELECT id FROM commerce_woo_hook_events WHERE source_id=$1", source.ID).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	for _, delivery := range []string{"fictional-delivery", "different-delivery"} {
		r := receive(body, delivery, wooTestSignature(source.Secret, body))
		if r.Code != 200 || !strings.Contains(r.Body.String(), eventID) {
			t.Fatal("retry dedup lost", r.Code, r.Body.String())
		}
	}
	if r := receive(append(append([]byte{}, body...), ' '), "fictional-delivery", wooTestSignature(source.Secret, body)); r.Code != 401 {
		t.Fatal("changed bytes passed HMAC")
	}
	changed := []byte(`{"id":55,"name":"Changed"}`)
	if r := receive(changed, "fictional-delivery", wooTestSignature(source.Secret, changed)); r.Code != 409 {
		t.Fatal("changed delivery digest overwrote history", r.Code)
	}
	if r := receive(changed, "different-delivery", wooTestSignature(source.Secret, changed)); r.Code != 409 {
		t.Fatal("alternate delivery ID lost its original digest binding", r.Code)
	}
	var count int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM commerce_woo_hook_events WHERE source_id=$1", source.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("duplicate notice persisted", count, err)
	}
	read := httptest.NewRecorder()
	s.commerceWooHooksRead(read, httptest.NewRequest("GET", "https://app.example.invalid/", nil), ws, "live", owner, 0)
	if read.Code != 200 || bytes.Contains(read.Body.Bytes(), []byte(source.Secret)) || bytes.Contains(read.Body.Bytes(), []byte("private-must-not-be-retained")) {
		t.Fatal("metadata leaked private data", read.Code, read.Body.String())
	}
	s.wooRequest = func(ctx context.Context, r *http.Request) (*http.Response, error) {
		if r.URL.Host != "fixture-shop.example.invalid" || r.Method != "GET" {
			t.Fatal("unexpected store/destination", r.URL)
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != "fictional-consumer-key" || pass != "fictional-consumer-secret" {
			t.Fatal("wrong source credentials")
		}
		raw := ""
		switch r.URL.Path {
		case "/wp-json/wc/v3/settings/general/woocommerce_currency":
			raw = `{"id":"woocommerce_currency","value":"BDT"}`
		case "/wp-json/wc/v3/products/55":
			raw = `{"id":55,"name":"Fictional current API product","type":"simple","status":"publish","sku":"API-ONLY-55","price":"250.00","attributes":[]}`
		default:
			t.Fatal("unexpected product request", r.URL)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(raw)), Header: http.Header{}}, nil
	}
	preview := command(owner, "woocommerce-preview", newUUID(), map[string]any{"event_id": eventID})
	if preview.Code != 200 || !bytes.Contains(preview.Body.Bytes(), []byte("API-ONLY-55")) || bytes.Contains(preview.Body.Bytes(), []byte("UNTRUSTED-PAYLOAD-SKU")) {
		t.Fatal("preview trusted webhook instead of current API", preview.Code, preview.Body.String())
	}
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM commerce_products WHERE workspace_id=$1", ws).Scan(&count); err != nil || count != 0 {
		t.Fatal("notice/preview automatically changed catalog", count, err)
	}
	if r := command(viewer, "woocommerce-preview", newUUID(), map[string]any{"event_id": eventID}); r.Code != 403 {
		t.Fatal("viewer requested current private source", r.Code)
	}
	if r := command(owner, "woocommerce-preview", newUUID(), map[string]any{"event_id": newUUID()}); r.Code != 403 {
		t.Fatal("foreign event preview accepted", r.Code)
	}
	if _, err = pool.Exec(ctx, "UPDATE commerce_woo_hook_events SET product_name='rewrite' WHERE id=$1", eventID); err == nil {
		t.Fatal("immutable notice was rewritten")
	}
	config["origin"] = "https://changed-shop.example.invalid"
	if r := command(owner, "integration-save", newUUID(), config); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	if r := receive(body, "after-source-change", wooTestSignature(source.Secret, body)); r.Code != 404 {
		t.Fatal("changed connection inherited old webhook")
	}
	config["origin"] = "https://fixture-shop.example.invalid"
	if r := command(owner, "integration-save", newUUID(), config); r.Code != 200 {
		t.Fatal(r.Code)
	}
	if r := command(owner, "woo-hook-disable", newUUID(), map[string]any{"id": source.ID}); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	if r := receive(body, "after-disable", wooTestSignature(source.Secret, body)); r.Code != 404 {
		t.Fatal("disabled source accepted notice")
	}
	t.Log("WOO SIGNED SOURCE SQL/Go PASS: encrypted/recoverable create, raw-byte HMAC, replay/conflict/tamper/role/connection/revocation guards, private immutable metadata and current BDT API preview without catalog mutation")
}
