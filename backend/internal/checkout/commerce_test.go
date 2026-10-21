package checkout

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCommerceMoneyExact(t *testing.T) {
	for _, v := range []struct {
		raw  string
		want int64
	}{{"0", 0}, {"0.01", 1}, {"100.1", 10010}, {"1000000000.00", 100000000000}} {
		got, e := commerceMoney(v.raw)
		if e != nil || got != v.want {
			t.Fatalf("%q got %d error %v", v.raw, got, e)
		}
	}
	for _, bad := range []string{"-1", "1.001", "1e3", "NaN", " 1", ".50", "1.", "১", "1000000001.00"} {
		if _, e := commerceMoney(bad); e == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}
func TestCommerceOutboundRejectsPrivateBeforeSend(t *testing.T) {
	for _, u := range []string{"http://public.example/", "https://127.0.0.1/", "https://169.254.169.254/", "https://[::1]/", "https://10.0.0.1/", "https://localhost/", "https://public.example:8443/"} {
		r, _ := http.NewRequest("GET", u, nil)
		if _, e := commerceHTTPRequest(r.Context(), r); e == nil {
			t.Fatalf("private endpoint accepted %s", u)
		}
	}
}
func TestCommerceMissingRuntimeFailsClosed(t *testing.T) {
	for _, handler := range []func(http.ResponseWriter, *http.Request){(&Service{}).HandleCommerce, (&Service{}).HandleCommerceAPI} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/v1/commerce/orders?environment=live", nil)
		handler(w, r)
		if w.Code != 403 && w.Code != 503 {
			t.Fatalf("runtime failure returned %d", w.Code)
		}
	}
}

func TestWooCommerceCurrencyCannotBeRelabeled(t *testing.T) {
	for _, test := range []struct {
		body string
		want bool
	}{{`{"id":"woocommerce_currency","value":"BDT"}`, true}, {`{"id":"woocommerce_currency","value":"USD"}`, false}, {`{"value":"BDT"}`, false}, {`{"id":"woocommerce_currency","value":null}`, false}, {`not-json`, false}} {
		if got := wooCurrencyIsBDT(strings.NewReader(test.body)); got != test.want {
			t.Fatalf("currency confirmation %q got %v", test.body, got)
		}
	}
}
