package checkout

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"
)

func TestBillingRequiresMatchingVerifiedPayment(t *testing.T) {
	const workspace = "3c12457f-01e7-4b85-9269-0244b55c7be4"
	proof := billingPaymentProof{ID: "2d3965da-0f96-4b5c-b106-f55ffe11e837", Workspace: workspace, Amount: 5000, At: time.Now().UTC()}
	for _, tc := range []struct {
		name   string
		change func(*billingPaymentProof)
	}{
		{"matching", func(p *billingPaymentProof) {}},
		{"other workspace", func(p *billingPaymentProof) { p.Workspace = "993b5fe1-6022-4ec3-ac76-02fe4f43517f" }},
		{"wrong amount", func(p *billingPaymentProof) { p.Amount++ }},
		{"missing verification time", func(p *billingPaymentProof) { p.At = time.Time{} }},
		{"missing payment", func(p *billingPaymentProof) { p.ID = "" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := proof
			tc.change(&p)
			raw, _ := json.Marshal(p)
			_, ok, err := decodeBillingPaymentProof(raw, workspace, 5000)
			if tc.name == "matching" {
				if !ok || err != nil {
					t.Fatal("valid proof rejected")
				}
			} else if ok || err == nil {
				t.Fatal("invalid proof could authorize a subscription")
			}
		})
	}
	for _, raw := range [][]byte{nil, []byte("null")} {
		_, ok, err := decodeBillingPaymentProof(raw, workspace, 5000)
		if ok || err != nil {
			t.Fatal("unpaid invoice must be an ordinary unverified outcome")
		}
	}
	for _, raw := range []string{"{", "{}", "[]"} {
		_, ok, err := decodeBillingPaymentProof([]byte(raw), workspace, 5000)
		if ok || err == nil {
			t.Fatal("corrupt proof mistaken for a normal unpaid outcome")
		}
	}
}

func TestUnverifiedBillingHTTPOutcomes(t *testing.T) {
	for _, state := range []string{"requires_payer", "awaiting_payment", "cancelled", "expired", "exception", "", "completed", "unknown"} {
		t.Run(state, func(t *testing.T) {
			w := httptest.NewRecorder()
			writeUnverifiedBilling(w, state)
			if state == "completed" || state == "unknown" {
				if w.Code != 503 {
					t.Fatal("inconsistent state hidden as ordinary unpaid")
				}
				return
			}
			if w.Code != 200 {
				t.Fatal("ordinary unpaid result presented as error")
			}
			var body struct {
				Renewed bool   `json:"renewed"`
				Status  string `json:"payment_status"`
			}
			if json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Renewed {
				t.Fatal("unverified payment granted access")
			}
			want := state
			if want == "" {
				want = "not_created"
			}
			if body.Status != want {
				t.Fatal("checkout status lost")
			}
		})
	}
}
