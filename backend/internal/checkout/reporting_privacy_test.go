package checkout

import "testing"

func TestFinancialReportDetailMaskingByAuthorizedRole(t *testing.T) {
	for _, role := range []string{"viewer", "editor", "merchant_key", ""} {
		t.Run(role, func(t *testing.T) {
			data := map[string]any{
				"verified_gross_minor": float64(12345),
				"currency": "BDT",
				"customers": []any{map[string]any{"name": "fictional private payer", "id": "private-id"}},
				"accounts": []any{map[string]any{"account_id": "private-account"}},
			}
			restrictFinancialReportDetail(data, role)
			if got := len(data["customers"].([]any)); got != 0 {
				t.Fatalf("%q received private invoice-linked customers: %d", role, got)
			}
			if got := len(data["accounts"].([]any)); got != 0 {
				t.Fatalf("%q received financial account identities: %d", role, got)
			}
			if data["verified_gross_minor"] != float64(12345) || data["currency"] != "BDT" {
				t.Fatalf("%q lost authorized aggregate financial truth", role)
			}
		})
	}
	for _, role := range []string{"owner", "admin"} {
		t.Run(role, func(t *testing.T) {
			data := map[string]any{
				"customers": []any{map[string]any{"name": "authorized payer"}},
				"accounts": []any{map[string]any{"account_id": "authorized account"}},
			}
			restrictFinancialReportDetail(data, role)
			if len(data["customers"].([]any)) != 1 || len(data["accounts"].([]any)) != 1 {
				t.Fatalf("%q lost authorized report detail", role)
			}
		})
	}
}
