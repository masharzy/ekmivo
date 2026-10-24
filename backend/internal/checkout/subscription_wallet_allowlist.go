package checkout

import (
	"encoding/json"
	"strings"
)

// SaaS wallet capabilities are issued by pg10_intent with an invoice-scoped,
// immutable reference. Treat this marker as a stricter *restriction* only;
// spoofing the prefix cannot grant a merchant any extra checkout privilege.
func subscriptionCheckout(raw []byte) bool {
	var view struct { Reference string `json:"merchant_reference"` }
	return json.Unmarshal(raw, &view) == nil && strings.HasPrefix(view.Reference, "SAAS-") &&
		uuidPattern.MatchString(strings.TrimPrefix(view.Reference, "SAAS-"))
}

// Without a financial account-specific parser attestation, an account is
// permitted only when it is the sole configured receiving account for its
// approved, currently online method. Multiple accounts of one method fail
// closed instead of presenting an unverified destination or guessing a route.
func (s *Service) eligibleSubscriptionAccounts(checkout, encoded []byte) []map[string]any {
	var accounts []map[string]any
	if !subscriptionCheckout(checkout) || json.Unmarshal(encoded, &accounts) != nil {return nil}
	available := s.liveMethods(checkout)
	count := make(map[string]int)
	for _, account := range accounts {
		method, _ := account["method"].(string)
		if method == "bkash" || method == "nagad" || method == "rocket" {count[method]++}
	}
	ready := make([]map[string]any, 0, len(accounts))
	for _, account := range accounts {
		method, _ := account["method"].(string)
		id, _ := account["id"].(string)
		online, _ := account["source_online"].(bool)
		if uuidPattern.MatchString(id) && available[method] && online && count[method] == 1 {
			account["ready"] = true
			ready = append(ready, account)
		}
	}
	return ready
}

func subscriptionAccountEligible(accounts []map[string]any, method, accountID string) bool {
	for _, account := range accounts {
		if account["id"] == accountID && account["method"] == method && account["ready"] == true {return true}
	}
	return false
}
