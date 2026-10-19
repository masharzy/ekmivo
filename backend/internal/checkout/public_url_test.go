package checkout

import "testing"

func TestCheckoutURLIsCanonicalAndIndependentOfDashboardAlias(t *testing.T) {
	previous, allowed := publicCheckoutOrigin, getAllowedOrigin()
	defer func() { publicCheckoutOrigin = previous; SetAllowedOrigin(allowed) }()
	SetAllowedOrigin("https://ekmivo-web-masharzys-projects.vercel.app")
	if err := SetPublicCheckoutOrigin(""); err != nil {
		t.Fatal(err)
	}
	if got := publicCheckoutURL("opaque-token"); got != "https://ekmivo-web.vercel.app/checkout/opaque-token" {
		t.Fatal(got)
	}
	if err := SetPublicCheckoutOrigin("https://pay.example.com/"); err != nil {
		t.Fatal(err)
	}
	if got := publicCheckoutURL("opaque-token"); got != "https://pay.example.com/checkout/opaque-token" {
		t.Fatal(got)
	}
	for _, bad := range []string{"http://example.com", "https://user:pass@example.com", "https://example.com/prefix", "https://example.com?token=x", "https://example.com#x", "//example.com"} {
		if SetPublicCheckoutOrigin(bad) == nil {
			t.Fatalf("unsafe origin accepted: %s", bad)
		}
	}
}
