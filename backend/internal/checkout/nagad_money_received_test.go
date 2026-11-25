package checkout

import (
	"testing"
	"time"

	"github.com/masharzy/briofold/backend/internal/deviceevidence"
)

const nagadMoneyFlag = "BRIOFOLD_NAGAD_MONEY_RECEIVED_ENABLED"

func ruleIDs(rules []deviceevidence.ParserRule) []string {
	ids := []string{}
	for _, r := range rules {
		ids = append(ids, r.ID)
	}
	return ids
}

func TestNagadMoneyReceivedFlagOffKeepsEarlierRules(t *testing.T) {
	t.Setenv(nagadMoneyFlag, "")
	ids := ruleIDs(builtinSMSRules())
	if len(ids) != 2 || ids[0] != "builtin-bkash-received-v1" || ids[1] != "builtin-nagad-received-v1" {
		t.Fatalf("flag off must keep exactly the earlier rules, got %v", ids)
	}
	t.Setenv(nagadMoneyFlag, "false")
	if len(builtinSMSRules()) != 2 {
		t.Fatal("flag=false must keep the earlier rules")
	}
	body := "Money Received. Amount: Tk 250.00 Sender: 01912345678 Ref: Order TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32"
	for _, r := range builtinSMSRules() {
		if r.AcceptCapture(r.Source, "live", body) {
			t.Fatalf("flag off: %s accepted the Money Received layout", r.ID)
		}
	}
}

func TestNagadMoneyReceivedParsesBothLayouts(t *testing.T) {
	t.Setenv(nagadMoneyFlag, "true")
	rules := builtinSMSRules()
	if len(rules) != 3 || rules[2].ID != "builtin-nagad-money-received-v1" {
		t.Fatalf("flag on must append the new rule, got %v", ruleIDs(rules))
	}
	for _, r := range rules {
		if err := r.Validate(); err != nil {
			t.Fatalf("%s invalid: %v", r.ID, err)
		}
	}
	cases := []struct {
		name, text, payer, reference string
		amount                       int64
	}{
		{"one line with ref", "Money Received. Amount: Tk 250.00 Sender: 01912345678 Ref: Order 123 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32", "+8801912345678", "7ABC1234", 25000},
		{"one line no ref", "Money Received. Amount: Tk 250 Sender: 01912345678 TxnID: 7ABC1235 Balance: Tk 505.89 25/11/2026 19:32", "+8801912345678", "7ABC1235", 25000},
		{"one field per line", "Money Received.\nAmount: Tk 15.50\nSender: 01912345678\nRef: N/A\nTxnID: 7ABC1236\nBalance: Tk 1,505.89\n25/11/2026 19:32", "+8801912345678", "7ABC1236", 1550},
		{"crlf and trailing newline", "Money Received.\r\nAmount: Tk 15.50\r\nSender: 01912345678\r\nTxnID: 7ABC1237\r\nBalance: Tk 505.89\r\n25/11/2026 19:32\r\n", "+8801912345678", "7ABC1237", 1550},
		{"thousands separator", "Money Received. Amount: Tk 1,250.50 Sender: 01912345678 Ref: Order TxnID: 7ABC1238 Balance: Tk 3,886.93 25/11/2026 19:32", "+8801912345678", "7ABC1238", 125050},
		{"lakh grouping", "Money Received. Amount: Tk 1,00,000.00 Sender: +8801912345678 TxnID: 7ABC1239 Balance: Tk 1,23,456.78 25/11/2026 19:32", "+8801912345678", "7ABC1239", 10000000},
		{"empty ref value", "Money Received. Amount: Tk 99.00 Sender: 01912345678 Ref: TxnID: 7ABC1240 Balance: Tk 0.00 25/11/2026 19:32", "+8801912345678", "7ABC1240", 9900},
		{"opaque balance text", "Money Received. Amount: Tk 99.00 Sender: 01912345678 TxnID: 7ABC1241 Balance: Tk BALANCE 25/11/2026 19:32", "+8801912345678", "7ABC1241", 9900},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			matched := 0
			for _, r := range rules {
				if !r.AcceptCapture(r.Source, "live", tc.text) {
					continue
				}
				got, err := r.Parse(r.Source, "live", tc.text)
				if err != nil {
					t.Fatalf("%s accepted but failed to parse: %v", r.ID, err)
				}
				matched++
				if r.ID != "builtin-nagad-money-received-v1" {
					t.Fatalf("unexpected rule %s", r.ID)
				}
				if got.Payer != tc.payer || got.Amount != tc.amount || got.Reference != tc.reference ||
					got.Method != "nagad" || got.Precision != "minute" {
					t.Fatalf("bad parsed receipt: %+v", got)
				}
				want := time.Date(2026, 11, 25, 13, 32, 0, 0, time.UTC) // 19:32 Asia/Dhaka
				if !got.TransactionAt.Equal(want) {
					t.Fatalf("bad transaction time: %s", got.TransactionAt)
				}
			}
			if matched != 1 {
				t.Fatalf("expected exactly one rule to accept this receipt, got %d", matched)
			}
		})
	}
}

func TestNagadMoneyReceivedRejectsPartialOutgoingAndMalformed(t *testing.T) {
	t.Setenv(nagadMoneyFlag, "true")
	inputs := []string{
		"Money Sent. Amount: Tk 250.00 Receiver: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32",
		"Your Nagad OTP is 123456",
		"Money Received. Amount: Tk 250.00 Sender: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89",                            // no time
		"Money Received. Amount: Tk 250.00 Sender: 01912345678 Balance: Tk 505.89 25/11/2026 19:32",                           // no TxnID
		"Money Received. Amount: Tk 250.00 Sender: 019123 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32",                // short payer
		"Money Received. Amount: Tk 250.00 Sender: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32\nOTP 1234", // trailing text
		"Prefix Money Received. Amount: Tk 250.00 Sender: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32",    // not anchored at start
		"Money Received. Amount: Tk 1,00 Sender: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32",             // bad grouping
		"Money Received. Amount: Tk 12,34 Sender: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32",            // bad grouping
		"Money Received. Amount: Tk 0.00 Sender: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32",             // zero
		"Money Received. Amount: Tk 250.555 Sender: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89 25/11/2026 19:32",          // 3 decimals
		"Money Received. Amount: Tk 250.00 Sender: 01912345678 TxnID: 7ABC1234 Balance: Tk 505.89 25-11-2026 19:32",           // other date layout
	}
	for _, body := range inputs {
		for _, r := range builtinSMSRules() {
			if !r.AcceptCapture(r.Source, "live", body) {
				continue
			}
			if _, err := r.Parse(r.Source, "live", body); err == nil {
				t.Fatalf("%s accepted unsafe message %q", r.ID, body)
			}
		}
	}
}

func TestNagadMoneyReceivedDoesNotDisturbEarlierGrammars(t *testing.T) {
	t.Setenv(nagadMoneyFlag, "true")
	cases := []struct{ source, text, wantRule string }{
		{"bKash", "You have received Tk 500.00 from 01881114519. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS582 at 01/10/2026 15:40", "builtin-bkash-received-v1"},
		{"NAGAD", "You have received Tk 500.00 from 01881114519. Ref: Order 123. Current Balance: Tk 505.89. TxnID: DJ168FS584 Date: 01/10/2026 15:40", "builtin-nagad-received-v1"},
	}
	for _, tc := range cases {
		var hit []string
		for _, r := range builtinSMSRules() {
			if r.Source == tc.source && r.AcceptCapture(r.Source, "live", tc.text) {
				hit = append(hit, r.ID)
			}
		}
		if len(hit) != 1 || hit[0] != tc.wantRule {
			t.Fatalf("%s: want only %s, got %v", tc.source, tc.wantRule, hit)
		}
	}
	// Existing rules still refuse comma amounts: grouping is opt-in per rule.
	for _, r := range builtinSMSRules() {
		if r.ID != "builtin-nagad-money-received-v1" && r.AmountGrouping {
			t.Fatalf("%s must not enable AmountGrouping", r.ID)
		}
	}
}
