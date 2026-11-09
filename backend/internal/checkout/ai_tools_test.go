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
		`{"tool":"get_product","args":{"variant_id":"x"}}`, `{"reply":""}`, `{"reply":"a"} {"reply":"b"}`, `{broken`} {
		if c, _, err := parseAIToolOutput(bad); err == nil && c != nil {
			t.Fatalf("accepted %s", bad)
		} else if err == nil {
			t.Fatalf("no error for %s", bad)
		}
	}
}

func TestRedactArgs(t *testing.T) {
	out := redactArgs(map[string]any{"query": "call 01712345678 trx ABCD1234EF", "address": "House 1", "transaction_id": "X1", "note": "ok"})
	if out["address"] != "[redacted]" || out["transaction_id"] != "[redacted]" {
		t.Fatalf("keys not redacted: %v", out)
	}
	q := out["query"].(string)
	if strings.Contains(q, "01712345678") || strings.Contains(q, "ABCD1234EF") {
		t.Fatalf("value leaked: %s", q)
	}
	if out["note"] != "ok" {
		t.Fatal("plain value changed")
	}
}

func TestSignedPayloads(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	now := time.Unix(1_800_000_000, 0)
	tok, err := signAIPayload(secret, map[string]any{"thread": "t", "order_id": "o", "action": "pay_cod"}, aiQuoteTTL, now)
	if err != nil {
		t.Fatal(err)
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
	tampered := "x" + tok
	if _, err := verifyAIPayload(secret, tampered, now); err == nil {
		t.Fatal("tampered token accepted")
	}
}

func TestAILimits(t *testing.T) {
	if l := aiLimits("ms"); l.MaxCards != 10 || l.MaxButtons != 3 {
		t.Fatalf("messenger limits %+v", l)
	}
	if !aiMediaAllowed("audio", 120, 0) || aiMediaAllowed("audio", 121, 0) {
		t.Fatal("voice limit")
	}
	if !aiMediaAllowed("video", 30, 20<<20) || aiMediaAllowed("video", 31, 1) || aiMediaAllowed("video", 10, 21<<20) {
		t.Fatal("video limit")
	}
	if aiStepKey("job-key-1234567890", 1) == aiStepKey("job-key-1234567890", 2) || len(aiStepKey("k", 1)) > 128 {
		t.Fatal("step keys")
	}
}
