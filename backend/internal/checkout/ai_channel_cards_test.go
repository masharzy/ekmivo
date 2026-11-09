package checkout

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestAIChannelProductButtonsRejectTamperExpiryAndForeignScope(t *testing.T) {
	key := bytes.Repeat([]byte{3}, 32)
	workspace, thread, ref := newUUID(), newUUID(), newUUID()
	now := time.Unix(2000000000, 0)
	token := signAIOrderButton(key, workspace, thread, ref, now.Add(time.Minute).Unix())
	if len(token) >= 200 {
		t.Fatal("button exceeds WhatsApp's payload limit")
	}
	turn, ok := aiOrderButtonTurn(key, token, workspace, thread, now)
	if !ok || !strings.Contains(turn, ref) {
		t.Fatalf("valid click was not converted to a customer turn: %q", turn)
	}
	buf, _ := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(token, aiButtonPrefix))
	buf[34] ^= 1
	tampered := aiButtonPrefix + base64.RawURLEncoding.EncodeToString(buf)
	for _, test := range []struct {
		token, workspace, thread string
		now                      time.Time
	}{
		{tampered, workspace, thread, now},
		{token, newUUID(), thread, now},
		{token, workspace, newUUID(), now},
		{token, workspace, thread, now.Add(time.Minute)},
	} {
		if _, ok := aiOrderButtonTurn(key, test.token, test.workspace, test.thread, test.now); ok {
			t.Fatal("accepted a tampered, expired or cross-tenant button")
		}
	}
	raw, _ := json.Marshal(map[string]string{"payload": token, "id": token, "message": "ordinary text"})
	stored := string(redactAIChannelButtons(raw))
	if strings.Contains(stored, token) || !strings.Contains(stored, "ordinary text") {
		t.Fatal("webhook storage retained a button capability or lost an ordinary message")
	}
}

func TestAIChannelProductCardsProviderLimitsAndFlagOffFallback(t *testing.T) {
	t.Setenv("BRIOFOLD_AI_TOOLS_ENABLED", "true")
	t.Setenv("BRIOFOLD_AI_CHANNEL_COMMERCE_ENABLED", "true")
	t.Setenv("BRIOFOLD_AI_KILL_SWITCH", "")
	t.Setenv("BRIOFOLD_AI_TOOLS_WORKSPACES", "")
	key := bytes.Repeat([]byte{8}, 32)
	svc := Service{Pipeline: &Pipeline{Key: key}}
	facts := make([]json.RawMessage, 0, 12)
	for i := 0; i < 12; i++ {
		variants := make([]map[string]any, 0, 4)
		for n := 0; n < 4; n++ {
			variants = append(variants, map[string]any{"variant_ref": newUUID(), "price_minor": 70000 + n, "available": 1})
		}
		fact, _ := json.Marshal(map[string]any{"product_ref": newUUID(), "name": "Example product", "variants": variants})
		facts = append(facts, fact)
	}
	cards := buildAIProductCards(facts, "en", time.Now())
	if len(cards.Cards) != 10 || len(cards.Cards[0].Buttons) != 3 {
		t.Fatal("wrong generic card/button limits")
	}
	job := inboxSendJob{Workspace: newUUID(), Thread: newUUID(), Text: "Here are the products.", Type: "text",
		Content: map[string]any{"ai_cards": cards}}
	for _, provider := range []string{"ms", "ig", "wa"} {
		job.Channel = provider
		payload, err := svc.inboxSendPayload(context.Background(), job, "", "")
		if err != nil {
			t.Fatal(err)
		}
		encoded, _ := json.Marshal(payload)
		if provider == "wa" {
			if !strings.Contains(string(encoded), `"type":"list"`) || bytes.Count(encoded, []byte(aiButtonPrefix)) != 10 {
				t.Fatal("WhatsApp list exceeded row limit or omitted choices")
			}
		} else if !strings.Contains(string(encoded), `"template_type":"generic"`) || bytes.Count(encoded, []byte(aiButtonPrefix)) != 30 {
			t.Fatal("Meta generic template has incorrect card or button count")
		}
	}
	t.Setenv("BRIOFOLD_AI_CHANNEL_COMMERCE_ENABLED", "false")
	payload, err := svc.inboxSendPayload(context.Background(), job, "", "")
	if err != nil || payload["type"] != "text" {
		t.Fatal("flag-off provider payload changed")
	}
}
