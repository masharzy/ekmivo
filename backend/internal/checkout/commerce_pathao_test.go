package checkout

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestPathaoContractBoundaries(t *testing.T) {
	var sent map[string]any
	client := pathaoClient{do: func(ctx context.Context, r *http.Request) (*http.Response, error) {
		if r.URL.Scheme != "https" || r.URL.Host != "api-hermes.pathao.com" || r.URL.RawQuery != "" || r.Header.Get("Authorization") != "Bearer fictional-token" {
			t.Fatal("provider/auth boundary", r.URL)
		}
		if err := json.NewDecoder(r.Body).Decode(&sent); err != nil {
			t.Fatal(err)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"code":200,"type":"success","data":{"consignment_id":"fictional-1","merchant_order_id":"BF-fixture"}}`))}, nil
	}}
	options := pathaoTestOptions()
	d := pathaoShipment{ID: "fixture", COD: 12300, Recipient: map[string]string{"name": "Fictional Customer", "phone": "+8801700001234", "address": "Fictional address only"}}
	if id, err := client.book(context.Background(), "fictional-token", d, options); err != nil || id != "fictional-1" {
		t.Fatal(id, err)
	}
	if sent["amount_to_collect"] != float64(123) || sent["recipient_phone"] != "01700001234" || sent["merchant_order_id"] != "BF-fixture" {
		t.Fatal("immutable provider identity changed", sent)
	}
	d.COD = 12301
	if _, err := client.book(context.Background(), "fictional-token", d, options); err == nil {
		t.Fatal("fractional COD rounded")
	}
	for _, test := range []struct {
		field string
		value any
	}{{"recipient_zone", float64(0)}, {"item_weight", float64(.49)}, {"item_weight", float64(11)}, {"item_type", float64(3)}, {"delivery_type", float64(12)}, {"store_id", float64(1.2)}, {"secret", "must-not-be-persisted"}} {
		copy := pathaoTestOptions()
		copy[test.field] = test.value
		if validatePathaoOptions(copy) == nil {
			t.Fatal("invalid options accepted", test)
		}
	}
	client.do = func(context.Context, *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"code":200,"type":"success","data":{"consignment_id":"foreign","merchant_order_id":"BF-fixture","order_status_slug":"Delivered"}}`))}, nil
	}
	d.Consignment = "fictional-1"
	if _, err := client.status(context.Background(), "fictional-token", d); err == nil {
		t.Fatal("foreign status accepted")
	}
}
func pathaoTestOptions() map[string]any {
	return map[string]any{"store_id": float64(1), "recipient_city": float64(2), "recipient_zone": float64(3), "recipient_area": float64(0), "delivery_type": float64(48), "item_type": float64(2), "item_quantity": float64(1), "item_weight": float64(.5)}
}

// Invoked only by the authorized disposable CI harness, never a shared DB.
func TestPathaoControlBookingIsolation(t *testing.T) {
	target := os.Getenv("PG_PATHAO_TEST_CONTROL_URL")
	if target == "" {
		t.Skip("isolated CONTROL fixture not supplied")
	}
	u, err := url.Parse(target)
	if err != nil || !(u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1") || strings.Contains(strings.ToLower(u.Path), "prod") {
		t.Fatal("refusing shared database")
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
	ws := newUUID()
	must := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	must("INSERT INTO workspaces(id,name,service_mode,created_by) VALUES($1,'Fictional Pathao Store','both',$2)", ws, owner)
	must("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')", ws, owner, viewer)
	t.Setenv("BRIOFOLD_PATHAO_ENABLED", "true")
	s := &Service{Pipeline: &Pipeline{Control: pool, Key: bytes.Repeat([]byte{37}, 32)}}
	call := func(actor, realm, action, key string, b map[string]any) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "https://application.example.test/commerce", nil)
		s.commercePathao(w, r, ws, realm, actor, key, action, b)
		return w
	}
	credentials := map[string]any{"provider": "pathao", "api_key": "fixture-client", "secret": "fictional-client-secret", "username": "merchant@example.invalid", "password": "fictional-password"}
	if r := call(owner, "live", "integration-save", newUUID(), credentials); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	var cipher []byte
	if err = pool.QueryRow(ctx, "SELECT secret_cipher FROM commerce_integrations WHERE workspace_id=$1 AND provider='pathao'", ws).Scan(&cipher); err != nil || bytes.Contains(cipher, []byte("fictional-password")) {
		t.Fatal("credentials not encrypted", err)
	}
	posts, calls, unknown := 0, 0, false
	lastID := ""
	s.pathaoRequest = func(ctx context.Context, r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "api-hermes.pathao.com" {
			t.Fatal("provider host changed")
		}
		path := r.URL.Path
		var response any
		switch {
		case strings.HasSuffix(path, "/issue-token"):
			var b map[string]string
			_ = json.NewDecoder(r.Body).Decode(&b)
			if b["client_secret"] != "fictional-client-secret" || b["grant_type"] != "password" || b["username"] != "merchant@example.invalid" {
				t.Fatal("credential source changed")
			}
			response = map[string]any{"access_token": "fictional-token", "token_type": "Bearer"}
		case strings.HasSuffix(path, "/orders"):
			posts++
			var b map[string]any
			_ = json.NewDecoder(r.Body).Decode(&b)
			lastID = b["merchant_order_id"].(string)
			if b["amount_to_collect"] != float64(100) || b["recipient_phone"] != "01700001234" {
				t.Fatal("COD/recipient changed", b)
			}
			if unknown {
				return nil, errors.New("fictional lost response")
			}
			response = map[string]any{"code": 200, "type": "success", "data": map[string]any{"consignment_id": "fictional-consignment", "merchant_order_id": lastID}}
		case strings.HasSuffix(path, "/info"):
			response = map[string]any{"code": 200, "type": "success", "data": map[string]any{"consignment_id": "fictional-consignment", "merchant_order_id": lastID, "order_status_slug": "Delivered"}}
		default:
			var values []map[string]any
			switch {
			case strings.HasSuffix(path, "/stores"):
				values = []map[string]any{{"store_id": 1, "store_name": "Fictional pickup", "is_active": 1}}
			case strings.HasSuffix(path, "/city-list"):
				values = []map[string]any{{"city_id": 2, "city_name": "Fictional city"}}
			case strings.HasSuffix(path, "/zone-list"):
				if !strings.Contains(path, "/cities/2/") {
					t.Fatal("wrong parent")
				}
				values = []map[string]any{{"zone_id": 3, "zone_name": "Fictional zone"}}
			default:
				t.Fatal("unexpected request", path)
			}
			response = map[string]any{"code": 200, "type": "success", "data": map[string]any{"data": values}}
		}
		if !strings.HasSuffix(path, "/issue-token") && r.Header.Get("Authorization") != "Bearer fictional-token" {
			t.Fatal("auth missing")
		}
		data, _ := json.Marshal(response)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(data))}, nil
	}
	create := func(cod int64, provider string) string {
		t.Helper()
		oid, did := newUUID(), newUUID()
		must("INSERT INTO commerce_orders(id,workspace_id,environment,reference,status,source,recipient,subtotal_minor,total_minor) VALUES($1,$2,'live',$1::text,'confirmed','manual','{\"name\":\"Fictional Customer\",\"phone\":\"+8801700001234\",\"address\":\"Fictional address only\"}',$3,$3)", oid, ws, cod)
		must("INSERT INTO commerce_deliveries(id,workspace_id,environment,order_id,provider,status,cod_minor) VALUES($1,$2,'live',$3,$4,'ready',$5)", did, ws, oid, provider, cod)
		return did
	}
	id, key := create(10000, "pathao"), newUUID()
	body := map[string]any{"provider": "pathao", "id": id, "options": pathaoTestOptions()}
	if r := call(viewer, "live", "courier-book", key, body); r.Code != 403 || calls != 0 {
		t.Fatal("viewer reached provider", r.Code, calls)
	}
	if r := call(owner, "sandbox", "courier-book", key, body); r.Code != 422 || calls != 0 {
		t.Fatal("wrong realm reached provider")
	}
	if r := call(owner, "live", "courier-book", key, body); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	if posts != 1 {
		t.Fatal("not exactly one dispatch")
	}
	before := calls
	for _, retry := range []string{key, newUUID()} {
		if r := call(owner, "live", "courier-book", retry, body); r.Code != 409 || calls != before {
			t.Fatal("replay reached provider", r.Code, calls)
		}
	}
	if r := call(owner, "live", "courier-status", newUUID(), map[string]any{"id": id}); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	var state, orderState, providerStatus string
	var cod int64
	if err = pool.QueryRow(ctx, "SELECT d.status,o.status,d.provider_status,d.cod_received_minor FROM commerce_deliveries d JOIN commerce_orders o ON o.id=d.order_id WHERE d.id=$1", id).Scan(&state, &orderState, &providerStatus, &cod); err != nil || state != "booked" || orderState != "confirmed" || providerStatus != "Delivered" || cod != 0 {
		t.Fatal("fabricated fulfillment/cash", state, orderState, providerStatus, cod, err)
	}
	unknown = true
	id = create(10000, "pathao")
	body["id"] = id
	if r := call(owner, "live", "courier-book", newUUID(), body); r.Code != 409 {
		t.Fatal(r.Code, r.Body.String())
	}
	before = posts
	if r := call(owner, "live", "courier-book", newUUID(), body); r.Code != 409 || posts != before {
		t.Fatal("unknown booking retried")
	}
	if err = pool.QueryRow(ctx, "SELECT status FROM commerce_deliveries WHERE id=$1", id).Scan(&state); err != nil || state != "unknown" {
		t.Fatal("unknown outcome lost", err)
	}
	body["id"] = create(10001, "pathao")
	if r := call(owner, "live", "courier-book", newUUID(), body); r.Code != 422 || posts != before {
		t.Fatal("fractional COD booked", r.Code)
	}
	body["id"] = create(10000, "steadfast")
	before = calls
	if r := call(owner, "live", "courier-book", newUUID(), body); r.Code != 403 || calls != before {
		t.Fatal("provider boundary leaked", r.Code)
	}
	if r := call(viewer, "live", "integration-disable", newUUID(), credentials); r.Code != 403 {
		t.Fatal("viewer changed credentials")
	}
	t.Log("PATHAO SQL/Go provider-contract PASS: encrypted credentials, role/realm, locations, whole-taka COD, one durable dispatch, replay/unknown denial, bound status and independent cash/fulfillment")
}
