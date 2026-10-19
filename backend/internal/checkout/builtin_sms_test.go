package checkout

import (
	"strings"
	"testing"
	"time"
)

func TestBuiltinSMSParsersRecognizeSupportedReceipts(t *testing.T) {
	rules := builtinSMSRules()
	cases := []struct {
		name, source, text, payer, reference string
	}{
		{"bkash-basic", "bKash", "You have received Tk 500.00 from 01881114519. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS582 at 01/10/2026 15:40", "+8801881114519", "DJ168FS582"},
		{"bkash-ref", "bKash", "You have received Tk 500.00 from 01881114519. Ref Order 123. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS583 at 01/10/2026 15:40", "+8801881114519", "DJ168FS583"},
		{"nagad", "NAGAD", "You have received Tk 500.00 from 01881114519. Ref: Order 123. Current Balance: Tk 505.89. TxnID: DJ168FS584 Date: 01/10/2026 15:40", "+8801881114519", "DJ168FS584"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recognized := 0
			for _, r := range rules {
				if r.Source != tc.source {
					continue
				}
				if err := r.Validate(); err != nil {
					t.Fatalf("invalid built-in grammar: %v", err)
				}
				if !r.AcceptCapture(r.Source, "live", tc.text) {
					continue
				}
				got, err := r.Parse(r.Source, "live", tc.text)
				if err != nil {
					t.Fatal(err)
				}
				recognized++
				if got.Receiving != "" || got.Payer != tc.payer || got.Amount != 50000 ||
					got.Reference != tc.reference || got.Method == "" || got.Precision != "minute" {
					t.Fatalf("bad parsed receipt: %+v", got)
				}
				expected := time.Date(2026, 10, 1, 9, 40, 0, 0, time.UTC)
				if !got.TransactionAt.Equal(expected) {
					t.Fatalf("bad transaction time: %s", got.TransactionAt)
				}
			}
			if recognized != 1 {
				t.Fatalf("expected exactly one built-in match, got %d", recognized)
			}
		})
	}
}

func TestBuiltinSMSParsersDoNotAcceptPartialOrOutgoingMessages(t *testing.T) {
	inputs := []string{
		"Your bKash OTP is 123456",
		"You have sent Tk 500.00 to 01881114519. TrxID DJ168FS582",
		"You have received Tk 500.00 from 01881114519. Fee Tk 0.00. Balance Tk 505.89.",
		"You have received Tk 500.00 from 01881114519. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS582 at 01/10/2026 15:40\nYour OTP is 1234",
	}
	for _, body := range inputs {
		for _, r := range builtinSMSRules() {
			if r.AcceptCapture(r.Source, "live", body) {
				t.Fatalf("unexpected acceptance by %s", r.ID)
			}
		}
	}
}

func TestBalanceIsOpaqueAndNeverPaymentEvidence(t *testing.T) {
	for _, balance := range []string{"3,886.93", "1,23,456.78", "not supplied", "0.00"} {
		for _, rule := range builtinSMSRules() {
			text := "You have received Tk 15.00 from 01881717457. Fee Tk 0.00. Balance Tk BALANCE. TrxID DJJ28M5K7U at 19/10/2026 14:51"
			if rule.Method == "nagad" {
				text = "You have received Tk 15.00 from 01881717457. Ref: Order. Current Balance: Tk BALANCE. TxnID: DJJ28M5K7U Date: 19/10/2026 14:51"
			}
			got, err := rule.Parse(rule.Source, "live", strings.Replace(text, "BALANCE", balance, 1))
			if err != nil || got.Amount != 1500 || got.Payer != "+8801881717457" || got.Reference != "DJJ28M5K7U" {
				t.Fatalf("balance affected verification fields: %v", err)
			}
		}
	}
}
