package checkout

import (
	"strings"
	"testing"
	"time"
)

const flexFlag = "BRIOFOLD_SMS_FLEX_ENABLED"

func flexParse(t *testing.T, source, text string) (amount int64, payer, ref string, at time.Time, precision string, err error) {
	t.Helper()
	count := 0
	var perr error
	for _, r := range builtinSMSRules() {
		if r.Source != source {
			continue
		}
		if e := r.Validate(); e != nil {
			t.Fatalf("%s invalid: %v", r.ID, e)
		}
		if !r.AcceptCapture(r.Source, "live", text) {
			continue
		}
		got, e := r.Parse(r.Source, "live", text)
		if e != nil {
			perr = e
			continue
		}
		count++
		amount, payer, ref, at, precision = got.Amount, got.Payer, got.Reference, got.TransactionAt, got.Precision
	}
	if count == 1 {
		return amount, payer, ref, at, precision, nil
	}
	if perr != nil {
		return 0, "", "", time.Time{}, "", perr
	}
	return 0, "", "", time.Time{}, "", errNoMatch
}

type flexErr string

func (e flexErr) Error() string { return string(e) }

const errNoMatch = flexErr("no single rule accepted")

func TestFlexOffKeepsStrictRules(t *testing.T) {
	t.Setenv(flexFlag, "")
	ids := ruleIDs(builtinSMSRules())
	if len(ids) != 2 || ids[0] != "builtin-bkash-received-v1" || ids[1] != "builtin-nagad-received-v1" {
		t.Fatalf("flag off must keep the strict rules, got %v", ids)
	}
}

func TestFlexOneRulePerSource(t *testing.T) {
	t.Setenv(flexFlag, "true")
	seen := map[string]int{}
	for _, r := range builtinSMSRules() {
		seen[r.Source]++
	}
	if len(seen) != 2 || seen["bKash"] != 1 || seen["NAGAD"] != 1 {
		t.Fatalf("exactly one flex rule per source is required (two would conflict): %v", seen)
	}
}

func TestFlexAcceptsEveryKnownLayout(t *testing.T) {
	t.Setenv(flexFlag, "true")
	d := time.Date(2026, 10, 1, 9, 40, 0, 0, time.UTC) // 15:40 Asia/Dhaka
	cases := []struct {
		name, source, text, payer, ref string
		amount                         int64
		at                             time.Time
		precision                      string
	}{
		// the strict-rule samples must still parse identically
		{"strict bkash", "bKash", "You have received Tk 500.00 from 01881114519. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS582 at 01/10/2026 15:40", "+8801881114519", "DJ168FS582", 50000, d, "minute"},
		{"strict bkash ref", "bKash", "You have received Tk 500.00 from 01881114519. Ref Order 123. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS583 at 01/10/2026 15:40", "+8801881114519", "DJ168FS583", 50000, d, "minute"},
		{"strict nagad", "NAGAD", "You have received Tk 500.00 from 01881114519. Ref: Order 123. Current Balance: Tk 505.89. TxnID: DJ168FS584 Date: 01/10/2026 15:40", "+8801881114519", "DJ168FS584", 50000, d, "minute"},
		// other bKash layouts (PipraPay public templates)
		{"bkash cash in", "bKash", "Cash In Tk 500.00 from 01881114519 successful. Fee Tk 0.00. Balance Tk 1,505.89. TrxID DJ168FS585 at 01/10/2026 15:40", "+8801881114519", "DJ168FS585", 50000, d, "minute"},
		{"bkash payment", "bKash", "You have received payment Tk 500.00 from 01881114519. Ref Order 9. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS586 at 01/10/2026 15:40", "+8801881114519", "DJ168FS586", 50000, d, "minute"},
		{"bkash comma amount", "bKash", "You have received Tk 1,250.50 from 01881114519. Fee Tk 0.00. Balance Tk 3,505.89. TrxID DJ168FS587 at 01/10/2026 15:40", "+8801881114519", "DJ168FS587", 125050, d, "minute"},
		{"bkash lakh", "bKash", "You have received Tk 1,00,000.00 from 01881114519. Fee Tk 0.00. Balance Tk 1,05,000.89. TrxID DJ168FS588 at 01/10/2026 15:40", "+8801881114519", "DJ168FS588", 10000000, d, "minute"},
		{"bkash seconds", "bKash", "You have received Tk 500.00 from 01881114519. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS589 at 01/10/2026 15:40:12", "+8801881114519", "DJ168FS589", 50000, d.Add(12 * time.Second), "second"},
		{"bkash intl payer, multiline", "bKash", "You have received Tk 500\nfrom +8801881114519.\nFee Tk 0.00.\nBalance Tk 505.89.\nTrxID DJ168FS590\nat 01/10/2026 15:40\n", "+8801881114519", "DJ168FS590", 50000, d, "minute"},
		{"bkash reordered, dash date", "bKash", "TrxID DJ168FS591. You have received Tk 500.00 from 01881114519. Balance Tk 505.89. Fee Tk 0.00. 01-10-2026 15:40", "+8801881114519", "DJ168FS591", 50000, d, "minute"},
		{"bkash iso date", "bKash", "You have received Tk 500.00 from 01881114519. TrxID DJ168FS592 at 2026-10-01 15:40:00", "+8801881114519", "DJ168FS592", 50000, d, "second"},
		{"bkash 12h", "bKash", "You have received Tk 500.00 from 01881114519. TrxID DJ168FS593 at 01/10/2026 03:40 PM", "+8801881114519", "DJ168FS593", 50000, d, "minute"},
		{"bkash tk without space", "bKash", "You have received Tk500 from 01881114519. TrxID DJ168FS594 at 01/10/2026 15:40", "+8801881114519", "DJ168FS594", 50000, d, "minute"},
		// the owner's real bKash SMS (19 Nov 2026, comma amount, no ref)
		{"real bkash 1000", "bKash", "You have received Tk 1,000.00 from 01826687856. Fee Tk 0.00. Balance Tk 2,406.35. TrxID DKJ8NK8VI8 at 19/11/2026 01:36", "+8801826687856", "DKJ8NK8VI8", 100000, time.Date(2026, 11, 18, 19, 36, 0, 0, time.UTC), "minute"},
		// a second number is fine when the one after "from" is clear
		{"from plus another number", "bKash", "You have received Tk 500.00 from 01881114519 to 01911114519. TrxID DJ168FS595 at 01/10/2026 15:40", "+8801881114519", "DJ168FS595", 50000, d, "minute"},
		// Nagad "Money Received"
		{"nagad money received", "NAGAD", "Money Received. Amount: Tk 500.00 Sender: 01881114519 Ref: Order TxnID: 7ABC1234 Balance: Tk 505.89 01/10/2026 15:40", "+8801881114519", "7ABC1234", 50000, d, "minute"},
		{"nagad money received lines", "NAGAD", "Money Received.\nAmount: Tk 1,500.00\nSender: 01881114519\nTxnID: 7ABC1235\nBalance: Tk 2,505.89\n01/10/2026 15:40", "+8801881114519", "7ABC1235", 150000, d, "minute"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			amount, payer, ref, at, precision, err := flexParse(t, tc.source, tc.text)
			if err != nil {
				t.Fatal(err)
			}
			if amount != tc.amount || payer != tc.payer || ref != tc.ref || precision != tc.precision || !at.Equal(tc.at) {
				t.Fatalf("got amount=%d payer=%s ref=%s at=%s precision=%s", amount, payer, ref, at, precision)
			}
		})
	}
}

func TestFlexNeverPaysFromUnsafeOrAmbiguousText(t *testing.T) {
	t.Setenv(flexFlag, "true")
	bad := map[string]string{
		"outgoing":            "You have sent Tk 500.00 to 01881114519. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS582 at 01/10/2026 15:40",
		"otp":                 "Your bKash OTP is 123456. You have received Tk 500.00 from 01881114519. TrxID DJ168FS582 at 01/10/2026 15:40",
		"cash out":            "Cash Out Tk 500.00 to 01881114519 successful. You have received nothing. TrxID DJ168FS582 at 01/10/2026 15:40",
		"no time":             "You have received Tk 500.00 from 01881114519. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS582",
		"no trxid":            "You have received Tk 500.00 from 01881114519. Fee Tk 0.00. Balance Tk 505.89. at 01/10/2026 15:40",
		"no payer":            "You have received Tk 500.00. Fee Tk 0.00. Balance Tk 505.89. TrxID DJ168FS582 at 01/10/2026 15:40",
		"masked payer":        "You have received Tk 500.00 from 018811*****. TrxID DJ168FS582 at 01/10/2026 15:40",
		"two amounts":         "You have received Tk 500.00 from 01881114519. Bonus Tk 20.00. TrxID DJ168FS582 at 01/10/2026 15:40",
		"two from payers":     "You have received Tk 500.00 from 01881114519 and from 01911114519. TrxID DJ168FS582 at 01/10/2026 15:40",
		"two numbers no from": "You have received Tk 500.00 (01881114519, 01911114519). TrxID DJ168FS582 at 01/10/2026 15:40",
		"two ids":             "You have received Tk 500.00 from 01881114519. TrxID DJ168FS582 TrxID DJ168FS583 at 01/10/2026 15:40",
		"two times":           "You have received Tk 500.00 from 01881114519. TrxID DJ168FS582 at 01/10/2026 15:40 or 02/10/2026 15:40",
		"bad grouping":        "You have received Tk 12,34 from 01881114519. TrxID DJ168FS582 at 01/10/2026 15:40",
		"zero":                "You have received Tk 0.00 from 01881114519. TrxID DJ168FS582 at 01/10/2026 15:40",
		"impossible date":     "You have received Tk 500.00 from 01881114519. TrxID DJ168FS582 at 31/02/2026 15:40",
		"balance only":        "You have received a message. Balance Tk 505.89. from 01881114519 TrxID DJ168FS582 at 01/10/2026 15:40",
		"received but no tk":  "You have received 500 from 01881114519. TrxID DJ168FS582 at 01/10/2026 15:40",
		"unrelated":           "Your account balance is Tk 4000",
		"failed":              "Cash In Tk 500.00 from 01881114519 failed. TrxID DJ168FS582 at 01/10/2026 15:40",
	}
	for name, text := range bad {
		for _, source := range []string{"bKash", "NAGAD"} {
			if _, _, _, _, _, err := flexParse(t, source, text); err == nil {
				t.Errorf("%s/%s: accepted unsafe text %q", name, source, text)
			}
		}
	}
}

func TestFlexIgnoresOtherSendersAndFeeBalanceFigures(t *testing.T) {
	t.Setenv(flexFlag, "true")
	text := "You have received Tk 500.00 from 01881114519. Fee Tk 5.00. Balance Tk 9,999.00. TrxID DJ168FS582 at 01/10/2026 15:40"
	if _, _, _, _, _, err := flexParse(t, "Rocket", text); err == nil {
		t.Fatal("a source without a flex rule must not parse")
	}
	amount, _, _, _, _, err := flexParse(t, "bKash", text)
	if err != nil || amount != 50000 {
		t.Fatalf("fee/balance must not be read as the amount: %d, %v", amount, err)
	}
}

func TestFlexRoutePatternIsPhoneSafe(t *testing.T) {
	t.Setenv(flexFlag, "true")
	for _, r := range builtinSMSRules() {
		pat := r.RoutePattern()
		if !strings.HasPrefix(pat, "(?is)^(?=") || !strings.HasSuffix(pat, ".*$") || !strings.Contains(pat, "(?!") {
			t.Fatalf("%s: unexpected route pattern %q", r.ID, pat)
		}
	}
}
