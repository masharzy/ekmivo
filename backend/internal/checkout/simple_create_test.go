package checkout

import (
	"encoding/json"
	"testing"
)

func TestSimpleBDTParsing(t *testing.T) {
	for _, tc := range []struct {
		input string
		minor int64
		valid bool
	}{
		{"150", 15000, true}, {"150.50", 15050, true}, {"0.01", 1, true}, {"1000000000", 100000000000, true},
		{"0", 0, false}, {"0.001", 0, false}, {"-1", 0, false}, {"1e3", 0, false},
		{"1.999", 0, false}, {"\"150\"", 15000, true}, {"\"300.00\"", 30000, true}, {"\"0.01\"", 1, true}, {"\"1000000000\"", 100000000000, true}, {"\"1000000000.01\"", 0, false}, {"\"0.001\"", 0, false}, {"\"1e3\"", 0, false}, {"\"001\"", 0, false}, {"1000000000.01", 0, false},
		{"01", 0, false}, {"150.5", 15050, true},
	} {
		got, ok := parseBDT(json.RawMessage(tc.input))
		if got != tc.minor || ok != tc.valid {
			t.Errorf("%s => %d/%v expected %d/%v", tc.input, got, ok, tc.minor, tc.valid)
		}
	}
}
func TestSimpleCreateDefaultsAndLegacyCompatibility(t *testing.T) {
	w := "527bf31a-bb41-4d3d-8c7f-9dbe725dc1df"
	key := "idempotency-key-123456"
	simple := createRequest{AmountBDT: json.RawMessage("150.50"), RedirectURL: "https://merchant.example/success"}
	if !prepareCreateRequest(&simple, key, w, "sandbox") {
		t.Fatal("simple request rejected")
	}
	if simple.Amount != 15050 || simple.Currency != "BDT" || simple.Expiry != 30 || simple.Reference == "" {
		t.Fatalf("bad defaults: %#v", simple)
	}
	retry := createRequest{AmountBDT: json.RawMessage("150.50"), RedirectURL: "https://merchant.example/success"}
	if !prepareCreateRequest(&retry, key, w, "sandbox") || retry.Reference != simple.Reference {
		t.Fatal("idempotent defaults changed")
	}
	legacy := createRequest{Reference: "old-order", Amount: 12500, Currency: "BDT", Expiry: 15}
	if !prepareCreateRequest(&legacy, key, w, "sandbox") || legacy.Amount != 12500 {
		t.Fatal("legacy integration broken")
	}
}
func TestSimpleCreateRejectsUnsafeInputs(t *testing.T) {
	tests := []createRequest{
		{AmountBDT: json.RawMessage("99"), RedirectURL: "http://merchant.example/success"},
		{AmountBDT: json.RawMessage("99"), Amount: 9900, RedirectURL: "https://merchant.example/success"},
		{AmountBDT: json.RawMessage("99"), RedirectURL: "https://merchant.example/success", WebhookURL: "http://localhost/hook"},
		{AmountBDT: json.RawMessage("99"), RedirectURL: "https://merchant.example/success", Metadata: json.RawMessage("[]")},
		{AmountBDT: json.RawMessage("99"), RedirectURL: "https://merchant.example/success", CustomerEmail: "bad email"},
	}
	for i, body := range tests {
		if prepareCreateRequest(&body, "idempotency-123456", "527bf31a-bb41-4d3d-8c7f-9dbe725dc1df", "sandbox") {
			t.Errorf("accepted invalid request %d", i)
		}
	}
}
func TestBotCreateWithoutRedirect(t *testing.T) {
	body := createRequest{AmountBDT: json.RawMessage("99")}
	if !prepareCreateRequest(&body, "bot-order-123456789", "527bf31a-bb41-4d3d-8c7f-9dbe725dc1df", "live") {
		t.Fatal("bot or native backend must not need a website redirect")
	}
}

func TestMerchantShopPayloadAliases(t *testing.T) {
  request := []byte(`{"fullname":"Easy Education","email":"shop@example.com","amount":"300.00","metadata":{"userId":"shop-user","mobileNumber":"8801880000000","courses":[{"id":"course1","price":300}]}}`)
  var body createRequest
  if err := json.Unmarshal(request, &body); err != nil {
    t.Fatalf("merchant payload should decode: %v", err)
  }
  if !prepareCreateRequest(&body,"shop-payment-idempotency-1","527bf31a-bb41-4d3d-8c7f-9dbe725dc1df","live") {
    t.Fatal("merchant shop payload was rejected")
  }
  if body.Amount != 30000 || body.CustomerName != "Easy Education" || body.CustomerEmail != "shop@example.com" || body.Fullname != "" || body.Email != "" {
    t.Fatalf("incorrect normalized customer information / amount: %#v", body)
  }
  if len(body.Metadata) == 0 || body.Currency != "BDT" || body.Expiry != 30 {
    t.Fatal("metadata and default checkout options should be preserved")
  }
}
func TestMerchantShopRejectsConflictingAliases(t *testing.T) {
  for _, b := range []createRequest{
    {AmountBDT: json.RawMessage(`"300.00"`),Fullname:"Different",CustomerName:"Original"},
    {AmountBDT: json.RawMessage(`"300.00"`),Email:"other@example.com",CustomerEmail:"shop@example.com"},
    {AmountBDT: json.RawMessage(`"300.00"`),Email:"invalid email"},
    {AmountBDT: json.RawMessage(`"300.00"`),Metadata:json.RawMessage(`[]`)},
    {AmountBDT: json.RawMessage(`"not money"`)},
    {AmountBDT: json.RawMessage(`"1e3"`)},
  }{
    if prepareCreateRequest(&b,"shop-payment-idempotency-2","527bf31a-bb41-4d3d-8c7f-9dbe725dc1df","live") {
      t.Errorf("accepted invalid shop payload: %#v",b)
    }
  }
}
