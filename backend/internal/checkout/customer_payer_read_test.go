package checkout

import (
	"encoding/base64"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

func TestReadEncryptedPayerPhone(t *testing.T) {
	key := []byte("01234567890123456789012345678901")
	aad := "workspace|live|refund-customer"
	receipt := []byte(`{"name":"","email":"","phone":"01712345678"}`)
	cipher, err := deviceevidence.Encrypt(key, receipt, aad)
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.StdEncoding.EncodeToString(cipher)
	if got := readEncryptedPayerPhone(key, encoded, aad); got != "+8801712345678" {
		t.Fatalf("expected canonical phone, got %q", got)
	}
	if got := readEncryptedPayerPhone(key, encoded, "wrong|live|refund-customer"); got != "" {
		t.Fatalf("wrong associated data revealed phone")
	}
	if got := readEncryptedPayerPhone(key, "not base64", aad); got != "" {
		t.Fatalf("invalid ciphertext revealed phone")
	}
	wrong := []byte("abcdefghijklmnopqrstuvwxyzABCDEF")
	if got := readEncryptedPayerPhone(wrong, encoded, aad); got != "" {
		t.Fatalf("wrong key revealed phone")
	}
}
func TestSetVerifiedPayerPhoneReplacesOnlySyntheticName(t *testing.T) {
	body := map[string]any{"name": "Payer · ••••5678", "phone": "••••5678"}
	setVerifiedPayerPhone(body, "+8801712345678")
	if body["name"] != "+8801712345678" || body["phone"] != "+8801712345678" {
		t.Fatal("synthetic identity not replaced")
	}
	manuallyNamed := map[string]any{"name": "Customer Name"}
	setVerifiedPayerPhone(manuallyNamed, "+8801712345678")
	if manuallyNamed["name"] != "Customer Name" {
		t.Fatal("custom name was replaced")
	}
}

func TestCustomerPayerLookupDoesNotRevealForNonOwners(t *testing.T) {
	for _, role := range []string{"", "viewer", "editor", "support", "super_admin", "merchant_api"} {
		t.Run(role, func(t *testing.T) {
			body := map[string]any{"source": "checkout_payer", "phone": "••••5678"}
			result := map[string]any{"items": []any{map[string]any{"id": "11111111-1111-4111-8111-111111111111", "body": body}}}
			// No configured pipeline: an accidental DB lookup or decrypt would fail.
			(&Service{}).supplementCustomerPayerNumbers(httptest.NewRequest("GET", "/customers", nil), "workspace", "live", result, role)
			if !reflect.DeepEqual(body, map[string]any{"source": "checkout_payer", "phone": "••••5678"}) {
				t.Fatal("restricted role revealed payer")
			}
		})
	}
}
func TestVerifiedSMSPhoneRecovery(t *testing.T) {
	key := []byte("01234567890123456789012345678901")
	rule := deviceevidence.ParserRule{ID: "fixture-v1", Version: 1, Source: "fixture", Method: "bkash", Pattern: `^Received (?P<amount>[0-9.]+) from (?P<payer>\+880[0-9]+) at (?P<time>[0-9: -]+) ref (?P<reference>[A-Z0-9]+)$`, TimeLayout: "2006-01-02 15:04:05", TimeZone: "Asia/Dhaka", Precision: "second", Approved: true, SandboxOnly: true}
	sms := []byte("Received 10.25 from +8801712345678 at 2026-10-11 12:00:00 ref SAMPLE1")
	cipher, err := deviceevidence.Encrypt(key, sms, "phone|immutable-event")
	if err != nil {
		t.Fatal(err)
	}
	valid := verifiedPayerSMSEvidence{Evidence: base64.StdEncoding.EncodeToString(cipher), AAD: "phone|immutable-event", Sender: "fixture"}
	rules := map[string]deviceevidence.ParserRule{"one": rule}
	if got := readVerifiedPayerSMSPhone(key, "workspace", "sandbox", valid, rules); got != "+8801712345678" {
		t.Fatalf("verified source fallback failed: %q", got)
	}
	t.Run("wrong-realm", func(t *testing.T) {
		if got := readVerifiedPayerSMSPhone(key, "workspace", "live", valid, rules); got != "" {
			t.Fatal("sandbox parser used live")
		}
	})
	t.Run("wrong-AAD", func(t *testing.T) {
		v := valid
		v.AAD = "other-phone|event"
		if readVerifiedPayerSMSPhone(key, "workspace", "sandbox", v, rules) != "" {
			t.Fatal("wrong receipt association decrypted")
		}
	})
	t.Run("wrong-source", func(t *testing.T) {
		v := valid
		v.Sender = "other"
		if readVerifiedPayerSMSPhone(key, "workspace", "sandbox", v, rules) != "" {
			t.Fatal("unrelated sender accepted")
		}
	})
	t.Run("unapproved", func(t *testing.T) {
		r := rule
		r.Approved = false
		if readVerifiedPayerSMSPhone(key, "workspace", "sandbox", valid, map[string]deviceevidence.ParserRule{"one": r}) != "" {
			t.Fatal("unapproved parser accepted")
		}
	})
	t.Run("ambiguous", func(t *testing.T) {
		if readVerifiedPayerSMSPhone(key, "workspace", "sandbox", valid, map[string]deviceevidence.ParserRule{"one": rule, "two": rule}) != "" {
			t.Fatal("ambiguous parser accepted")
		}
	})
	t.Run("wrong-key", func(t *testing.T) {
		if readVerifiedPayerSMSPhone([]byte("abcdefghijklmnopqrstuvwxyzABCDEF"), "workspace", "sandbox", valid, rules) != "" {
			t.Fatal("wrong key decrypted SMS")
		}
	})
	t.Run("scoped-contact", func(t *testing.T) {
		cipher, err := deviceevidence.Encrypt(key, []byte(`{"phone":"01712345678"}`), "workspace|sandbox|refund-customer")
		if err != nil {
			t.Fatal(err)
		}
		v := verifiedPayerSMSEvidence{Contact: base64.StdEncoding.EncodeToString(cipher)}
		if readVerifiedPayerSMSPhone(key, "workspace", "sandbox", v, nil) != "+8801712345678" {
			t.Fatal("scoped contact missing")
		}
		if readVerifiedPayerSMSPhone(key, "other-workspace", "sandbox", v, nil) != "" {
			t.Fatal("cross-tenant contact decrypted")
		}
	})
}
