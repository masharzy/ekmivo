package checkout

import (
	"testing"

	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

func TestSaaSWalletAccountAllowlistIsStrictAndMerchantIndependent(t *testing.T) {
	valid := deviceevidence.ParserRule{ID:"approved",Source:"bKash",Method:"bkash",Approved:true,
		Pattern:"^(?P<payer>.+) (?P<amount>.+) (?P<time>.+) (?P<reference>.+)$"}
	s := &Service{Pipeline:&Pipeline{Rules:map[string]deviceevidence.ParserRule{"approved":valid}}}
	const checkout = `{"merchant_reference":"SAAS-11111111-1111-4111-8111-111111111111","environment":"live","sources":[{"method":"bkash","source":"bKash","parser_id":"approved"}]}`
	const account = `[{"id":"11111111-1111-4111-8111-111111111112","method":"bkash","source_online":true}]`
	if !subscriptionCheckout([]byte(checkout)) {t.Fatal("invoice-scoped SaaS marker not recognized")}
	ready := s.eligibleSubscriptionAccounts([]byte(checkout),[]byte(account))
	if len(ready)!=1 || !subscriptionAccountEligible(ready,"bkash","11111111-1111-4111-8111-111111111112") {
		t.Fatal("sole online account with approved live parser should be selectable")
	}
	if subscriptionAccountEligible(ready,"nagad","11111111-1111-4111-8111-111111111112") ||
		subscriptionAccountEligible(ready,"bkash","11111111-1111-4111-8111-111111111113") {
		t.Fatal("cross-method or alternate account must be refused")
	}
	const double = `[{"id":"11111111-1111-4111-8111-111111111112","method":"bkash","source_online":true},{"id":"11111111-1111-4111-8111-111111111113","method":"bkash","source_online":true}]`
	if len(s.eligibleSubscriptionAccounts([]byte(checkout),[]byte(double)))!=0 {t.Fatal("ambiguous same-method accounts must fail closed")}
	if len(s.eligibleSubscriptionAccounts([]byte(checkout),[]byte(`[{"id":"11111111-1111-4111-8111-111111111112","method":"bkash","source_online":false}]`)))!=0 {
		t.Fatal("offline account is not permitted")
	}
	valid.Approved=false
	s.Pipeline.Rules["approved"]=valid
	if len(s.eligibleSubscriptionAccounts([]byte(checkout),[]byte(account)))!=0 {t.Fatal("unapproved parser cannot unlock SaaS account")}
	if subscriptionCheckout([]byte(`{"merchant_reference":"INV-merchant"}`)) ||
		len(s.eligibleSubscriptionAccounts([]byte(`{"merchant_reference":"INV-merchant"}`),[]byte(account)))!=0 {
		t.Fatal("seller checkout may not inherit SaaS account filter")
	}
}
