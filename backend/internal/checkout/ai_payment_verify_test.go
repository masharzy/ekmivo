package checkout

import (
	"testing"
	"time"
)

func TestMatchClaim(t *testing.T) {
	at := time.Unix(1_800_000_000, 0)
	c := aiClaim{Method: "bkash", DueMinor: 197000, OrderAt: at, PayerDigest: "p", Accounts: []string{"acc"}}
	base := func() *aiReceipt {
		return &aiReceipt{Method: "bkash", AmountMinor: 197000, At: at.Add(time.Minute), Direction: "incoming", PayerHMAC: "p", Account: "acc", Checkout: "unmatched"}
	}
	mod := func(f func(*aiReceipt)) *aiReceipt { r := base(); f(r); return r }
	cases := []struct {
		name string
		c    aiClaim
		r    *aiReceipt
		want string
	}{
		{"none", c, nil, "retry"},
		{"ok", c, base(), "matched"},
		{"any account when unset", aiClaim{Method: "bkash", DueMinor: 197000, OrderAt: at, PayerDigest: "p"}, mod(func(r *aiReceipt) { r.Account = "other" }), "matched"},
		{"ai only", aiClaim{ServiceMode: "ai"}, base(), "review"},
		{"short", c, mod(func(r *aiReceipt) { r.AmountMinor = 100 }), "review"},
		{"over", c, mod(func(r *aiReceipt) { r.AmountMinor = 300000 }), "review"},
		{"method", c, mod(func(r *aiReceipt) { r.Method = "nagad" }), "failed"},
		{"allocated", c, mod(func(r *aiReceipt) { r.Allocated = true }), "failed"},
		{"account", c, mod(func(r *aiReceipt) { r.Account = "other" }), "review"},
		{"sender", c, mod(func(r *aiReceipt) { r.PayerHMAC = "x" }), "review"},
		{"before order", c, mod(func(r *aiReceipt) { r.At = at.Add(-time.Hour) }), "review"},
		{"outgoing", c, mod(func(r *aiReceipt) { r.Direction = "outgoing" }), "failed"},
		{"checkout matched", c, mod(func(r *aiReceipt) { r.Checkout = "matched" }), "failed"},
		{"matcher pending", c, mod(func(r *aiReceipt) { r.Checkout = "pending" }), "retry"},
		{"matcher ambiguous", c, mod(func(r *aiReceipt) { r.Checkout = "ambiguous" }), "review"},
	}
	for _, tc := range cases {
		if got, _ := matchClaim(tc.c, tc.r); got != tc.want {
			t.Errorf("%s: got %s want %s", tc.name, got, tc.want)
		}
	}
}
