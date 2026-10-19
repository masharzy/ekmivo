package checkout

import (
	"strings"
	"testing"
)

func TestOfficialDefaultCustomerDetails(t *testing.T) {
	for _, brand := range []map[string]string{nil, {}, {"checkout_theme": ""}, {"checkout_theme": " null "}} {
		if err := validateCheckoutCustomerDetails(brand, map[string]string{"name": "Customer", "email": "customer@example.com"}); err != nil {
			t.Fatalf("Official form rejected: %v", err)
		}
		for _, details := range []map[string]string{{"addr": "not enabled"}, {"note": "not enabled"}, {"unknown": "x"}, {"email": "invalid"}, {"name": strings.Repeat("a", 2001)}, {"name": "bad\x00name"}} {
			if validateCheckoutCustomerDetails(brand, details) == nil {
				t.Fatalf("invalid or disabled field accepted: %v", details)
			}
		}
	}
}
func TestSavedCustomerDetailPreferencesRemainAuthoritative(t *testing.T) {
	disabled := map[string]string{"checkout_theme": `{"info":false,"f":{"name":true,"email":true}}`}
	if validateCheckoutCustomerDetails(disabled, map[string]string{"name": "Customer"}) == nil {
		t.Fatal("disabled collection bypassed")
	}
	custom := map[string]string{"checkout_theme": `{"info":true,"f":{"name":false,"email":false,"addr":true,"note":true}}`}
	if err := validateCheckoutCustomerDetails(custom, map[string]string{"addr": "Address", "note": "Note"}); err != nil {
		t.Fatal(err)
	}
	if validateCheckoutCustomerDetails(custom, map[string]string{"email": "customer@example.com"}) == nil {
		t.Fatal("merchant-disabled email accepted")
	}
	if validateCheckoutCustomerDetails(map[string]string{"checkout_theme": "{broken"}, map[string]string{"name": "Customer"}) == nil {
		t.Fatal("corrupt saved settings accepted")
	}
	if validateCheckoutCustomerDetails(disabled, nil) != nil {
		t.Fatal("optional details became mandatory")
	}
}
