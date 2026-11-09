package checkout

import (
	"testing"
	"time"
)

func TestMatchClaim(t *testing.T) {
	at := time.Unix(1_800_000_000, 0)
	c := aiClaim{Method: "bkash", DueMinor: 197000, OrderAt: at}
	ok := &aiReceipt{Method: "bkash", AmountMinor: 197000, At: at.Add(time.Minute), Direction: "incoming", OwnAccount: true}
	cases := []struct {
		name string
		r    *aiReceipt
		want string
	}{
		{"none", nil, "retry"},
		{"ok", ok, "matched"},
		{"short", &aiReceipt{Method: "bkash", AmountMinor: 100, At: ok.At, Direction: "incoming", OwnAccount: true}, "review"},
		{"over", &aiReceipt{Method: "bkash", AmountMinor: 300000, At: ok.At, Direction: "incoming", OwnAccount: true}, "review"},
		{"method", &aiReceipt{Method: "nagad", AmountMinor: 197000, At: ok.At, Direction: "incoming", OwnAccount: true}, "failed"},
		{"account", &aiReceipt{Method: "bkash", AmountMinor: 197000, At: ok.At, Direction: "incoming", OwnAccount: false}, "failed"},
		{"before order", &aiReceipt{Method: "bkash", AmountMinor: 197000, At: at.Add(-time.Hour), Direction: "incoming", OwnAccount: true}, "failed"},
		{"outgoing", &aiReceipt{Method: "bkash", AmountMinor: 197000, At: ok.At, Direction: "outgoing", OwnAccount: true}, "failed"},
	}
	for _, tc := range cases {
		if got, _ := matchClaim(c, tc.r); got != tc.want {
			t.Errorf("%s: got %s want %s", tc.name, got, tc.want)
		}
	}
}
