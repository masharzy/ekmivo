package checkout

import (
	"testing"

	"github.com/masharzy/briofold/backend/internal/deviceevidence"
)

// Owner decision 2026-11-22: with BRIOFOLD_OFFLINE_CHECKOUT_ENABLED=true an
// account whose SMS phone is offline is still offered; flag off keeps the old
// refusal. Everything else (approved parser, one account per method) stays.
func TestOfflineCheckoutFlagOffersOfflineAccount(t *testing.T) {
	valid := deviceevidence.ParserRule{ID: "approved", Source: "bKash", Method: "bkash", Approved: true,
		Pattern: "^(?P<payer>.+) (?P<amount>.+) (?P<time>.+) (?P<reference>.+)$"}
	s := &Service{Pipeline: &Pipeline{Rules: map[string]deviceevidence.ParserRule{"approved": valid}}}
	const checkout = `{"merchant_reference":"SAAS-11111111-1111-4111-8111-111111111111","environment":"live","sources":[{"method":"bkash","source":"bKash","parser_id":"approved"}]}`
	const offline = `[{"id":"11111111-1111-4111-8111-111111111112","method":"bkash","source_online":false}]`

	t.Setenv("BRIOFOLD_OFFLINE_CHECKOUT_ENABLED", "")
	if len(s.eligibleSubscriptionAccounts([]byte(checkout), []byte(offline))) != 0 {
		t.Fatal("flag off: an offline account must still be refused (old behaviour)")
	}
	t.Setenv("BRIOFOLD_OFFLINE_CHECKOUT_ENABLED", "true")
	if len(s.eligibleSubscriptionAccounts([]byte(checkout), []byte(offline))) != 1 {
		t.Fatal("flag on: an offline account must be offered")
	}
	const double = `[{"id":"11111111-1111-4111-8111-111111111112","method":"bkash","source_online":false},{"id":"11111111-1111-4111-8111-111111111113","method":"bkash","source_online":false}]`
	if len(s.eligibleSubscriptionAccounts([]byte(checkout), []byte(double))) != 0 {
		t.Fatal("flag on: two accounts of one method still fail closed")
	}
	valid.Approved = false
	s.Pipeline.Rules["approved"] = valid
	if len(s.eligibleSubscriptionAccounts([]byte(checkout), []byte(offline))) != 0 {
		t.Fatal("flag on: an unapproved parser still cannot unlock the account")
	}
}
