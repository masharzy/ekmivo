package checkout

import (
	"testing"
)

func TestPG05PayerNormalization(t *testing.T) {
	for _, value := range []string{"01712345678", "৮৮০১৭১২৩৪৫৬৭৮", "+8801712345678", "01712-345678", "٠١٧١٢٣٤٥٦٧٨"} {
		got, ok := NormalizePayer(value)
		if !ok || got != "+8801712345678" {
			t.Errorf("%q -> %q %v", value, got, ok)
		}
	}
	for _, value := range []string{"0171234567", "018123456789", "0161234567x", "019******78", "01212345678", "+8811712345678", ""} {
		if _, ok := NormalizePayer(value); ok {
			t.Errorf("accepted invalid payer %q", value)
		}
	}
}
func TestPG05DeterministicOpaqueToken(t *testing.T) {
	s := &Service{TokenKey: []byte("01234567890123456789012345678901")}
	a := s.token("workspace", "sandbox", "fixed-unguessable-create-key")
	if len(a) != 43 || a != s.token("workspace", "sandbox", "fixed-unguessable-create-key") {
		t.Fatal("token replay failed")
	}
	if a == s.token("other", "sandbox", "fixed-unguessable-create-key") ||
		a == s.token("workspace", "live", "fixed-unguessable-create-key") {
		t.Fatal("token lacks scope isolation")
	}
}
func TestPG05InvalidLinkedAmountRejected(t *testing.T) {
	valid := createRequest{Reference: "standalone-47", Amount: 2300, Currency: "BDT", Expiry: 15}
	if !validRequest(valid) {
		t.Fatal("standalone should work")
	}
	valid.OrderID = "client-controlled-order"
	if validRequest(valid) {
		t.Fatal("accepted unverified order amount")
	}
	valid.OrderID = "527bf31a-bb41-4d3d-8c7f-9dbe725dc1df"
	if validRequest(valid) {
		t.Fatal("accepted linked request with caller-controlled amount")
	}
	valid.Amount = 0
	if !validRequest(valid) {
		t.Fatal("linked server-source request wrongly refused")
	}
	valid.InvoiceID = "527bf31a-bb41-4d3d-8c7f-9dbe725dc1df"
	if validRequest(valid) {
		t.Fatal("accepted two conflicting linked sources")
	}
}

func TestCheckoutURLUsesTrustedWebOrigin(t *testing.T) {
 previous := getAllowedOrigin()
 defer SetAllowedOrigin(previous)
 SetAllowedOrigin("https://pay.example.test/")
 if got := checkoutURL("test_token"); got != "https://pay.example.test/checkout/test_token" {
  t.Fatalf("wrong checkout URL: %q", got)
 }
 for _, invalid := range []string{"", "http://pay.example.test", "https://user@pay.example.test", "https://pay.example.test/path", "https://pay.example.test/?foo=bar"} {
  SetAllowedOrigin(invalid)
  if got := checkoutURL("test_token"); got != "" {
   t.Fatalf("unsafe origin %q returned %q", invalid, got)
  }
 }
}
