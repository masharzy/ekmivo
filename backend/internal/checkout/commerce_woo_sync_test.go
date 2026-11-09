package checkout

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func wooFixture(t *testing.T, raw string) wooFull {
	t.Helper()
	var p wooFull
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestWooCatalogBodySimpleProduct(t *testing.T) {
	p := wooFixture(t, `{"id":42,"name":"Cotton Panjabi","type":"simple","status":"publish","sku":"PJ-42","price":"1250.50","description":"<p>Soft &amp; light</p>","manage_stock":true,"stock_quantity":7,"images":[{"src":"https://shop.example/a.jpg"}],"categories":[{"name":"Panjabi"}],"tags":[{"name":"eid"}]}`)
	body, urls, err := wooCatalogBody("https://shop.example", p, nil)
	if err != nil {
		t.Fatal(err)
	}
	variants := body["variants"].([]map[string]any)
	if body["source"] != "woo" || body["external_id"] != "shop.example:42" || body["description"] != "Soft & light" || body["category"] != "Panjabi" {
		t.Fatalf("unexpected body %v", body)
	}
	if len(variants) != 1 || variants[0]["price_minor"] != int64(125050) || variants[0]["stock"] != int64(7) || variants[0]["sku"] != "PJ-42" {
		t.Fatalf("unexpected variants %v", variants)
	}
	if len(urls) != 1 || urls[0] != "https://shop.example/a.jpg" {
		t.Fatalf("unexpected images %v", urls)
	}
}

func TestWooCatalogBodyVariableAndRejections(t *testing.T) {
	p := wooFixture(t, `{"id":9,"name":"Shirt","type":"variable","status":"publish"}`)
	vars := []wooFull{
		wooFixture(t, `{"id":91,"sku":"","price":"900","attributes":[{"name":"Size","option":"M"}],"manage_stock":true,"stock_quantity":-3}`),
		wooFixture(t, `{"id":92,"sku":"SH-L","price":"900","attributes":[{"name":"Size","option":"L"}]}`),
	}
	body, _, err := wooCatalogBody("https://shop.example", p, vars)
	if err != nil {
		t.Fatal(err)
	}
	got := body["variants"].([]map[string]any)
	if got[0]["sku"] != "WOO-9-91" || got[0]["stock"] != int64(0) || got[1]["sku"] != "SH-L" {
		t.Fatalf("unexpected variants %v", got)
	}
	if _, ok := got[1]["stock"]; ok {
		t.Fatal("unmanaged stock must be left untouched")
	}
	if _, _, err = wooCatalogBody("https://shop.example", p, nil); err == nil {
		t.Fatal("variable product without variations must be refused")
	}
	if _, _, err = wooCatalogBody("https://shop.example", wooFixture(t, `{"id":1,"name":"Bundle","type":"grouped"}`), nil); err == nil {
		t.Fatal("grouped products are unsupported")
	}
	if _, _, err = wooCatalogBody("https://shop.example", wooFixture(t, `{"id":1,"name":"Free","type":"simple","price":""}`), nil); err == nil {
		t.Fatal("missing price must be refused")
	}
}

func TestWooPlainTextStripsMarkupAndBounds(t *testing.T) {
	if got := wooPlainText("<script>x</script><b>Hi</b>&nbsp;there"); strings.ContainsAny(got, "<>") || !strings.Contains(got, "Hi there") {
		t.Fatalf("markup left in %q", got)
	}
	if got := []rune(wooPlainText(strings.Repeat("ক", 5000))); len(got) != 4000 {
		t.Fatalf("description not bounded: %d", len(got))
	}
}

func TestWooGetUsesInjectedTransport(t *testing.T) {
	request := func(ctx context.Context, r *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(r.URL.Path, "/products/5") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		return &http.Response{StatusCode: 404, Body: io.NopCloser(strings.NewReader(`{"code":"x"}`)), Header: http.Header{}}, nil
	}
	var p wooFull
	status, _, err := wooGet(context.Background(), request, commerceCredentials{Origin: "https://shop.example", APIKey: "k", Secret: "s"}, "products/5", &p)
	if err != nil || status != 404 {
		t.Fatalf("status=%d err=%v", status, err)
	}
}
