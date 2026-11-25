package deviceevidence

import (
	"testing"
	"time"
)

// Sample SMS are filled in from the public PipraPay templates (placeholders replaced
// by plausible values); they are NOT captured real messages, except where noted.
func pipraFlexRule() ParserRule {
	return ParserRule{ID: "generic-flex", Version: 1, Source: "any", Method: "other",
		TimeLayout: "02/01/2006 15:04", TimeZone: "Asia/Dhaka", Precision: "minute", Approved: true,
		Flex: true, TimeFromObserved: true,
		Incoming: `\b(?:you have received|has been received|money received|received payment|cash in|received|successfully received)\b`,
		Reject:   `\b(?:otp|pin|password|paid|cash[- ]?out|withdraw(?:n|al)?|recharge|bill|failed|unsuccessful|reversed|refund(?:ed)?|cancel(?:l?ed)?|request(?:ed)?)\b`}
}

func TestFlexReadsPipraPayTemplates(t *testing.T) {
	smsTime := time.Date(2026, 11, 18, 19, 36, 0, 0, time.UTC) // 19/11/2026 01:36 Asia/Dhaka
	observed := time.Date(2026, 11, 20, 4, 5, 33, 0, time.UTC)
	cases := []struct {
		name, text string
		amount     int64
		at         time.Time
	}{
		{"bkash personal (real)", "You have received Tk 1,000.00 from 01826687856. Fee Tk 0.00. Balance Tk 2,406.35. TrxID DKJ8NK8VI8 at 19/11/2026 01:36", 100000, smsTime},
		{"bkash personal ref", "You have received Tk 500.00 from 01826687856. Ref Order123 Fee Tk 0.00. Balance Tk 2,406.35. TrxID DKJ8NK8VI9 at 19/11/2026 01:36", 50000, smsTime},
		{"bkash cash in", "Cash In Tk 500.00 from 01826687856 successful. Fee Tk 0.00. Balance Tk 2,406.35. TrxID DKJ8NK8VJ1 at 19/11/2026 01:36", 50000, smsTime},
		{"bkash merchant", "You have received payment Tk 500.00 from 01826687856. Fee Tk 0.00. Balance Tk 2,406.35. TrxID DKJ8NK8VJ2 at 19/11/2026 01:36", 50000, smsTime},
		{"nagad personal", "Money Received. Amount: Tk 500.00 Sender: 01826687856 TxnID: 7ABC1234 Balance: Tk 2,406.35 19/11/2026 01:36", 50000, smsTime},
		{"nagad cash in", "Cash In Received. Amount: Tk 500.00 Uddokta: 01826687856 TxnID: 7ABC1235 Balance: 2,406.35 19/11/2026 01:36", 50000, smsTime},
		{"upay", "Tk. 500.00 has been received from 01826687856. Balance Tk. 2,406.35. TrxID UP12345678 at 19/11/2026 01:36.", 50000, smsTime},
		// no date-time in the SMS: the phone-observed minute is used
		{"tap", "Received Tk 500.00 from 01826687856. Balance Tk. 2,406.35. TxID: TP12345678.", 50000, observed.Truncate(time.Minute)},
		{"cellfin", "Islami Bank CellFin Received 500.00 Tk From CellFin: 01826687856 To CellFin: 01711111111 TrxId: CF12345678", 50000, observed.Truncate(time.Minute)},
		{"okwallet", "(OK Wallet) Successfully received Tk 500.00 from A/C 01826687856. Balance Tk 2,406.35. TrxID OK12345678", 50000, observed.Truncate(time.Minute)},
		{"mcash", "IBBL mCash You have received Tk: 500.00 From: 01826687856 Balance Tk: 2,406.35 TrxID: MC12345678", 50000, observed.Truncate(time.Minute)},
		{"pathaopay", "You have received BDT 500.00 from +8801826687856. Balance BDT 2,406.35 TrxID PP12345678", 50000, observed.Truncate(time.Minute)},
		{"amount after, taka word", "You have received 1,250 Taka from 01826687856. Balance 9,000 Taka. TrxID ZZ12345678", 125000, observed.Truncate(time.Minute)},
		{"bengali taka word", "আপনি 500.00 টাকা পেয়েছেন (received) from 01826687856 TrxID ZZ12345679", 50000, observed.Truncate(time.Minute)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := pipraFlexRule().ParseObserved("any", "live", tc.text, observed)
			if err != nil {
				t.Fatal(err)
			}
			if got.Amount != tc.amount || got.Payer != "+8801826687856" || !got.TransactionAt.Equal(tc.at) || got.Precision != "minute" {
				t.Fatalf("got %+v", got)
			}
		})
	}
}

func TestFlexRocketMaskedPayerStaysUnmatched(t *testing.T) {
	text := "Tk500.00 received from A/C:01826*****6 Fee:Tk0.00, Your A/C Balance: Tk2,406.35 TxnId:RK12345678"
	if _, err := pipraFlexRule().ParseObserved("any", "live", text, time.Now()); err == nil {
		t.Fatal("masked payer must not parse")
	}
}

func TestFlexObservedTimeRules(t *testing.T) {
	observed := time.Date(2026, 11, 20, 4, 5, 33, 0, time.UTC)
	noTime := "You have received Tk 500.00 from 01826687856. TrxID ZZ12345680"
	if _, err := pipraFlexRule().Parse("any", "live", noTime); err == nil {
		t.Fatal("Parse without an observed time must not invent a time")
	}
	if _, err := pipraFlexRule().ParseObserved("any", "live", noTime, time.Time{}); err == nil {
		t.Fatal("a zero observed time disables the fallback")
	}
	off := pipraFlexRule()
	off.TimeFromObserved = false
	if _, err := off.ParseObserved("any", "live", noTime, observed); err == nil {
		t.Fatal("rule without TimeFromObserved must not use the observed time")
	}
	// An SMS time always wins over the observed time, and two times never fall back.
	withTime := noTime + " at 19/11/2026 01:36"
	got, err := pipraFlexRule().ParseObserved("any", "live", withTime, observed)
	if err != nil || got.TransactionAt.Equal(observed.Truncate(time.Minute)) {
		t.Fatalf("SMS time must win: %+v %v", got, err)
	}
	two := withTime + " 20/11/2026 02:00"
	if _, err := pipraFlexRule().ParseObserved("any", "live", two, observed); err == nil {
		t.Fatal("two times must fail even with an observed time")
	}
	// Strict rules ignore the observed time entirely.
	strict := ParserRule{ID: "s", Version: 1, Source: "bKash", Method: "bkash", Pattern: `^x(?P<payer>1)(?P<amount>1)(?P<time>1)(?P<reference>1)$`,
		TimeLayout: "02/01/2006 15:04", TimeZone: "Asia/Dhaka", Precision: "minute", Approved: true}
	if _, err := strict.ParseObserved("bKash", "live", "x1111", observed); err == nil {
		t.Fatal("strict rule must not use observed time")
	}
}
