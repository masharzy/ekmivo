package checkout

import (
	"strings"
	"testing"
	"time"
)

func TestParseAIToolOutput(t *testing.T) {
	c, r, err := parseAIToolOutput("```json\n{\"tool\":\"search_products\",\"args\":{\"query\":\"punjabi\"}}\n```")
	if err != nil || c == nil || r != "" || c.Tool != "search_products" {
		t.Fatalf("tool call not parsed: %v %v %v", c, r, err)
	}
	if _, r, err = parseAIToolOutput(`{"reply":"Hello"}`); err != nil || r != "Hello" {
		t.Fatalf("reply not parsed: %q %v", r, err)
	}
	if _, r, err = parseAIToolOutput("Plain text"); err != nil || r != "Plain text" {
		t.Fatalf("plain text rejected: %q %v", r, err)
	}
	for _, bad := range []string{`{"tool":"drop_tables","args":{}}`, `{"tool":"quote_price","args":{"price_minor":1}}`,
		`{"tool":"get_product","args":{"variant_id":"x"}}`, `{"reply":""}`, `{"reply":"a"} {"reply":"b"}`, `{broken`,
		`Sure! {"tool":"search_products","args":{}}`, `{"tool":"upsert_order_draft","args":{"items":[{"variant_ref":"v","unit_minor":1}]}}`,
		`{"tool":"find_product_by_image","args":{}}`, ``} {
		if _, _, err := parseAIToolOutput(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestRedactArgs(t *testing.T) {
	out := redactArgs(map[string]any{"query": "call 01712345678 trx abcd1234ef", "recipient": map[string]any{"address": "House 1"},
		"items": []any{map[string]any{"variant_ref": "v", "note": "8801812345678"}}, "transaction_id": "X1", "note": "ok"})
	if out["recipient"] != "[redacted]" || out["transaction_id"] != "[redacted]" {
		t.Fatalf("keys not redacted: %v", out)
	}
	q := out["query"].(string)
	if strings.Contains(q, "01712345678") || strings.Contains(strings.ToLower(q), "abcd1234ef") {
		t.Fatalf("value leaked: %s", q)
	}
	if n := out["items"].([]any)[0].(map[string]any)["note"].(string); strings.Contains(n, "1812345678") {
		t.Fatalf("nested phone leaked: %s", n)
	}
	if out["note"] != "ok" {
		t.Fatal("plain value changed")
	}
	ref := "6f1c2d3e-0000-4000-a000-000000000001"
	if got := redactArgs(map[string]any{"variant_ref": ref})["variant_ref"]; got != ref {
		t.Fatalf("reference mangled: %v", got)
	}
}

func TestSignedPayloads(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	now := time.Unix(1_800_000_000, 0)
	in := map[string]any{"thread": "t", "order_id": "o", "action": "pay_cod"}
	tok, err := signAIPayload(secret, in, aiQuoteTTL, now)
	if err != nil {
		t.Fatal(err)
	}
	if _, mutated := in["exp"]; mutated {
		t.Fatal("caller map mutated")
	}
	if p, err := verifyAIPayload(secret, tok, now.Add(10*time.Minute)); err != nil || p["action"] != "pay_cod" {
		t.Fatalf("valid token rejected: %v", err)
	}
	if _, err := verifyAIPayload(secret, tok, now.Add(31*time.Minute)); err == nil {
		t.Fatal("expired token accepted")
	}
	if _, err := verifyAIPayload([]byte("ffffffffffffffffffffffffffffffff"), tok, now); err == nil {
		t.Fatal("wrong secret accepted")
	}
	if _, err := verifyAIPayload(secret, "x"+tok, now); err == nil {
		t.Fatal("tampered token accepted")
	}
}

func TestAILimitsAndKeys(t *testing.T) {
	if l := aiLimits("wa"); l.MaxButtons != 3 || !l.SeparateImages {
		t.Fatalf("whatsapp limits %+v", l)
	}
	if !aiMediaAllowed("audio", 120, 0) || aiMediaAllowed("audio", 121, 0) {
		t.Fatal("voice limit")
	}
	if !aiMediaAllowed("video", 30, 20<<20) || aiMediaAllowed("video", 31, 1) || aiMediaAllowed("video", 10, 21<<20) {
		t.Fatal("video limit")
	}
	job := "job-key-1234567890abcdef"
	if aiStepKey(job, 1) != job {
		t.Fatal("step 1 must use the job key so finish finds the metered generation")
	}
	if aiStepKey(job, 2) == aiStepKey(job, 3) || aiStepKey(job, 2) == job || len(aiStepKey(job, 5)) > 128 || len(aiStepKey(job, 5)) < 16 {
		t.Fatal("derived step keys")
	}
}

func TestAIProofArgs(t *testing.T) {
	s := &Service{PayerKey: []byte("0123456789abcdef0123456789abcdef")}
	args := map[string]any{"method": "bKash", "transaction_id": " testtrx0001 ", "sender_number": "01711111111"}
	if why := s.aiProofArgs(args); why != "" {
		t.Fatalf("valid proof refused: %s", why)
	}
	if _, raw := args["transaction_id"]; raw {
		t.Fatal("raw TrxID kept")
	}
	if _, raw := args["sender_number"]; raw {
		t.Fatal("raw sender number kept")
	}
	upper := map[string]any{"method": "bkash", "transaction_id": "TESTTRX0001", "sender_number": "01711111111"}
	s.aiProofArgs(upper)
	if args["transaction_digest"] != upper["transaction_digest"] || args["transaction_last4"] != "0001" || args["payer_last3"] != "111" {
		t.Fatalf("case or digits not normalized: %v", args)
	}
	if why := s.aiProofArgs(map[string]any{"method": "bkash", "transaction_id": "TESTTRX0001"}); why != "sender_number_required" {
		t.Fatalf("missing sender accepted: %s", why)
	}
	if why := s.aiProofArgs(map[string]any{"method": "card", "transaction_id": "TESTTRX0001", "sender_number": "01711111111"}); why != "method_required" {
		t.Fatalf("bad method accepted: %s", why)
	}
}

func TestAIToolsEnabledFor(t *testing.T) {
	t.Setenv("BRIOFOLD_AI_TOOLS_ENABLED", "true")
	t.Setenv("BRIOFOLD_AI_KILL_SWITCH", "")
	t.Setenv("BRIOFOLD_AI_TOOLS_WORKSPACES", "")
	if !aiToolsEnabledFor("w1") {
		t.Fatal("enabled for everyone when allowlist empty")
	}
	t.Setenv("BRIOFOLD_AI_TOOLS_WORKSPACES", "w2, w1")
	if !aiToolsEnabledFor("w1") || aiToolsEnabledFor("w3") {
		t.Fatal("allowlist not applied")
	}
	t.Setenv("BRIOFOLD_AI_KILL_SWITCH", "true")
	if aiToolsEnabledFor("w1") {
		t.Fatal("kill switch ignored")
	}
	t.Setenv("BRIOFOLD_AI_KILL_SWITCH", "")
	t.Setenv("BRIOFOLD_AI_TOOLS_ENABLED", "false")
	if aiToolsEnabledFor("w1") {
		t.Fatal("flag off must disable")
	}
}
