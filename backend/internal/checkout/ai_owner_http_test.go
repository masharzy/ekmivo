package checkout

import (
	"encoding/json"
	"testing"
)

func TestAISellingPatch(t *testing.T) {
	accounts := []aiOwnerAccount{{ID: "a1", Method: "bkash"}, {ID: "off", Method: "nagad", Disabled: true}}
	parse := func(s string) map[string]json.RawMessage {
		var m map[string]json.RawMessage
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			t.Fatal(err)
		}
		return m
	}
	if p, ok := aiSellingPatch(parse(`{"ai_selling_enabled":true,"cod_charge_minor":2000,"receiving_account_ids":["a1"],"handover_above_minor":1000000}`), accounts); !ok || p["cod_charge_minor"] != int64(2000) {
		t.Fatalf("valid patch refused: %v", p)
	}
	for _, bad := range []string{`{}`, `{"unknown":1}`, `{"cod_enabled":"yes"}`, `{"max_discount_pct":-1}`, `{"cod_charge_minor":1.5}`,
		`{"receiving_account_ids":["zz"]}`, `{"receiving_account_ids":["off"]}`, `{"receiving_account_ids":"a1"}`} {
		if _, ok := aiSellingPatch(parse(bad), accounts); ok {
			t.Fatalf("invalid patch accepted: %s", bad)
		}
	}
}
