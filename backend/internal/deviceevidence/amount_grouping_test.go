package deviceevidence

import "testing"

func TestStripAmountGroupingAcceptsOnlyStrictPositions(t *testing.T) {
	for in, want := range map[string]string{
		"500":          "500",
		"15.00":        "15.00",
		"1,250.50":     "1250.50",
		"12,345":       "12345",
		"1,234,567.89": "1234567.89",
		"1,00,000.00":  "100000.00",
		"12,34,567":    "1234567",
	} {
		got, ok := stripAmountGrouping(in)
		if !ok || got != want {
			t.Errorf("stripAmountGrouping(%q) = %q,%v; want %q,true", in, got, ok, want)
		}
	}
	for _, in := range []string{"1,2", "1,00", "12,34", ",500", "500,", "1,,000", "1,0000", "1.000,50", "১,২৫০"} {
		if got, ok := stripAmountGrouping(in); ok {
			t.Errorf("stripAmountGrouping(%q) accepted as %q", in, got)
		}
	}
}

func groupingRule(grouping bool) ParserRule {
	return ParserRule{
		ID: "grouping-fixture", Version: 1, Source: "fixture", Method: "nagad",
		Pattern:    `^Got Tk (?P<amount>[0-9,.]+) from (?P<payer>\+880[0-9]+) at (?P<time>[0-9: -]+) ref (?P<reference>[A-Z0-9]+)$`,
		TimeLayout: "2006-01-02 15:04:05", TimeZone: "Asia/Dhaka", Precision: "second",
		Approved: true, AmountGrouping: grouping,
	}
}

func TestAmountGroupingIsOptInPerRule(t *testing.T) {
	body := "Got Tk 1,250.50 from +8801712345678 at 2026-10-11 12:00:00 ref ABC123"
	if _, err := groupingRule(false).Parse("fixture", "live", body); err == nil {
		t.Fatal("comma amount accepted without AmountGrouping")
	}
	p, err := groupingRule(true).Parse("fixture", "live", body)
	if err != nil || p.Amount != 125050 {
		t.Fatalf("grouped amount not parsed: %d, %v", p.Amount, err)
	}
	lakh, err := groupingRule(true).Parse("fixture", "live", "Got Tk 1,00,000.00 from +8801712345678 at 2026-10-11 12:00:00 ref ABC124")
	if err != nil || lakh.Amount != 10000000 {
		t.Fatalf("lakh amount not parsed: %d, %v", lakh.Amount, err)
	}
	for _, bad := range []string{"1,00", "12,34", "1,2.00", "0,000", "1,250.555"} {
		_, err := groupingRule(true).Parse("fixture", "live", "Got Tk "+bad+" from +8801712345678 at 2026-10-11 12:00:00 ref ABC125")
		if err == nil {
			t.Errorf("malformed grouped amount %q accepted", bad)
		}
	}
}
