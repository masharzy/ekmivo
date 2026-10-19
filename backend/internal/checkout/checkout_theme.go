package checkout

import (
	"encoding/json"
	"errors"
	"net/mail"
	"strings"
)

// Saved merchant settings control collection; an absent theme uses the Official
// default (name/email only), matching the public checkout renderer.
// These are customer contact fields, never payer identity or payment evidence.
func validateCheckoutCustomerDetails(brand map[string]string, details map[string]string) error {
	if len(details) == 0 {
		return nil
	}
	var config struct {
		Info   bool            `json:"info"`
		Fields map[string]bool `json:"f"`
	}
	raw := strings.TrimSpace(brand["checkout_theme"])
	if raw == "" || raw == "null" {
		config.Info = true
		config.Fields = map[string]bool{"name": true, "email": true}
	} else if json.Unmarshal([]byte(raw), &config) != nil {
		return errors.New("invalid checkout theme")
	}
	if !config.Info {
		return errors.New("customer details disabled")
	}
	for key, value := range details {
		if !map[string]bool{"name": true, "email": true, "addr": true, "note": true}[key] || !config.Fields[key] || len(value) > 2000 || strings.ContainsRune(value, 0) {
			return errors.New("invalid customer detail")
		}
		if key == "email" && value != "" {
			address, err := mail.ParseAddress(value)
			if err != nil || address.Address != value {
				return errors.New("invalid contact email")
			}
		}
	}
	return nil
}
