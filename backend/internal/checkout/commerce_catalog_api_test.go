package checkout

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func catalogBody(t *testing.T, raw string) map[string]any {
	t.Helper()
	var b map[string]any
	if err := json.Unmarshal([]byte(raw), &b); err != nil {
		t.Fatal(err)
	}
	return b
}

func TestValidCatalogAPIBody(t *testing.T) {
	ok := `{"external_id":"A-1","name":"Panjabi","variants":[{"sku":"A-1-L","price_minor":90000,"stock":5,"options":{"size":"L"}}]}`
	if !validCatalogAPIBody(catalogBody(t, ok), true) {
		t.Fatal("valid create refused")
	}
	for name, raw := range map[string]string{
		"server owned id":        `{"external_id":"A","name":"x","id":"1","variants":[{"sku":"s","price_minor":1}]}`,
		"source is server owned": `{"external_id":"A","name":"x","source":"woo","variants":[{"sku":"s","price_minor":1}]}`,
		"no external id":         `{"name":"x","variants":[{"sku":"s","price_minor":1}]}`,
		"fractional price":       `{"external_id":"A","name":"x","variants":[{"sku":"s","price_minor":1.5}]}`,
		"zero price":             `{"external_id":"A","name":"x","variants":[{"sku":"s","price_minor":0}]}`,
		"string price":           `{"external_id":"A","name":"x","variants":[{"sku":"s","price_minor":"10"}]}`,
		"negative stock":         `{"external_id":"A","name":"x","variants":[{"sku":"s","price_minor":10,"stock":-1}]}`,
		"unknown variant field":  `{"external_id":"A","name":"x","variants":[{"sku":"s","price_minor":10,"id":"z"}]}`,
		"no variants":            `{"external_id":"A","name":"x"}`,
		"nine images":            `{"external_id":"A","name":"x","image_urls":["a","b","c","d","e","f","g","h","i"],"variants":[{"sku":"s","price_minor":10}]}`,
	} {
		if validCatalogAPIBody(catalogBody(t, raw), true) {
			t.Fatalf("%s must be refused", name)
		}
	}
	if validCatalogAPIBody(catalogBody(t, `{"external_id":"A","name":"x"}`), false) {
		t.Fatal("update must not accept external_id")
	}
	if !validCatalogAPIBody(catalogBody(t, `{"name":"Renamed"}`), false) {
		t.Fatal("partial update refused")
	}
}

func TestCatalogDerivedIDIsStable(t *testing.T) {
	a := catalogDerivedID("11111111-1111-1111-1111-111111111111", "img:0")
	b := catalogDerivedID("11111111-1111-1111-1111-111111111111", "img:0")
	c := catalogDerivedID("11111111-1111-1111-1111-111111111111", "img:1")
	if a != b || a == c || !uuidPattern.MatchString(a) {
		t.Fatalf("unstable ids %s %s %s", a, b, c)
	}
}

func TestProductAPIIsOffUnlessEnabled(t *testing.T) {
	t.Setenv("BRIOFOLD_PRODUCT_API_ENABLED", "false")
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete} {
		recorder := httptest.NewRecorder()
		(&Service{}).HandleProductAPI(recorder, httptest.NewRequest(method, "/v1/products?environment=live", nil))
		if recorder.Code != 404 {
			t.Fatalf("%s answered %d while the API is disabled", method, recorder.Code)
		}
	}
}

func TestCatalogRowCodeNeverLeaksDatabaseText(t *testing.T) {
	cases := map[string]string{"22023": "INVALID_ROW", "23505": "DUPLICATE_ROW", "42501": "NOT_ALLOWED", "XX000": "ROW_FAILED"}
	for code, want := range cases {
		err := &pgconn.PgError{Code: code, Message: "relation commerce_products secret detail"}
		if got := catalogRowCode(err); got != want {
			t.Fatalf("%s mapped to %s, want %s", code, got, want)
		}
	}
	if catalogRowCode(errors.New("connection refused")) != "ROW_FAILED" {
		t.Fatal("plain errors must map to the generic code")
	}
}
