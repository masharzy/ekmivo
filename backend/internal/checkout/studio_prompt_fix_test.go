package checkout

import (
	"encoding/json"
	"strings"
	"testing"
)

func promptFixContext(t *testing.T, question string) studioContext {
	t.Helper()
	var c studioContext
	if err := json.Unmarshal([]byte(`{"config":{"model":"test/model","instructions":"","language":"bn","tone":"friendly"},"question":`+strings.TrimSpace(mustJSON(question))+`,"knowledge":[],"products":[]}`), &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func mustJSON(v string) string {
	raw, _ := json.Marshal(v)
	return string(raw)
}

func TestPromptFixFlagOffKeepsEarlierPrompt(t *testing.T) {
	t.Setenv("BRIOFOLD_AI_PROMPT_FIX_ENABLED", "")
	c := promptFixContext(t, "Alu ase?")
	c.tools = true
	messages, err := studioMessages(c)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(messages[0].Content, "No tools are available.") || !strings.Contains(messages[0].Content, "You can only answer with text.") {
		t.Fatal("flag off must keep the earlier capability boundary byte for byte")
	}
	if !strings.Contains(studioCapabilityPolicy, "\n"+studioTextOnlyBoundary+"\n") {
		t.Fatal("text-only boundary is no longer a whole line of the policy")
	}
}

func TestPromptFixToolModeHasNoContradiction(t *testing.T) {
	t.Setenv("BRIOFOLD_AI_PROMPT_FIX_ENABLED", "true")
	c := promptFixContext(t, "Alu ase?")
	c.tools = true
	messages, err := studioMessages(c)
	if err != nil {
		t.Fatal(err)
	}
	system := messages[0].Content
	for _, banned := range []string{"No tools are available", "You can only answer with text", "place or confirm an order"} {
		if strings.Contains(system, banned) {
			t.Fatalf("tool-mode system message still says %q", banned)
		}
	}
	if !strings.Contains(system, "You act only through the tools described in TOOL MODE.") || !strings.Contains(system, "Business identity must come from") {
		t.Fatal("tool-mode boundary missing or other rules dropped")
	}
	// Without tool mode the flag changes nothing.
	c.tools = false
	c.Products = []json.RawMessage{json.RawMessage(`{"name":"আলু"}`)}
	messages, err = studioMessages(c)
	if err != nil || !strings.Contains(messages[0].Content, "No tools are available.") {
		t.Fatal("text-only mode must keep the text-only boundary", err)
	}
}

func TestPromptFixReplyLanguage(t *testing.T) {
	cases := []struct {
		question, config, off, on string
	}{
		{"Rahim Uddin, 01711111111, Mirpur 10, Dhaka", "bn", "en", "bn"},
		{"cash on delivery", "bn", "en", "bn"},
		{"ha confirm", "bn", "en", "bn"},
		{"Do you have potatoes in stock?", "bn", "en", "en"},
		{"What is the price of this?", "auto", "en", "en"},
		{"Rahim Uddin, Mirpur 10", "en", "en", "en"},
		{"Alu ase?", "bn", "bn", "bn"},
	}
	for _, flag := range []string{"", "true"} {
		t.Setenv("BRIOFOLD_AI_PROMPT_FIX_ENABLED", flag)
		for _, tc := range cases {
			c := promptFixContext(t, tc.question)
			c.Config.Language = tc.config
			want := tc.off
			if flag == "true" {
				want = tc.on
			}
			if got := studioReplyLanguage(c); got != want {
				t.Errorf("flag=%q config=%s %q: got %s want %s", flag, tc.config, tc.question, got, want)
			}
		}
	}
	// "auto" shop: a Latin address after Banglish stays Bengali only with the flag.
	t.Setenv("BRIOFOLD_AI_PROMPT_FIX_ENABLED", "true")
	c := promptFixContext(t, "Rahim Uddin, Mirpur 10, Dhaka")
	c.Config.Language = "auto"
	c.History = append(c.History, struct {
		Sender string `json:"sender"`
		Text   string `json:"text"`
	}{Sender: "customer", Text: "5 kg alu lagbe"})
	if studioReplyLanguage(c) != "bn" {
		t.Fatal("auto shop lost the conversation's Bengali")
	}
}

func TestPromptFixAllowsCustomersOwnNumber(t *testing.T) {
	reply := "আপনার অর্ডার লেখা হয়েছে: Rahim Uddin, 01711111111, মিরপুর ১০।"
	c := promptFixContext(t, "Rahim Uddin, 01711111111, Mirpur 10, Dhaka")
	t.Setenv("BRIOFOLD_AI_PROMPT_FIX_ENABLED", "")
	if studioSafeReplyMode(c, reply, true) == reply {
		t.Fatal("flag off: earlier behaviour replaced this reply; the test no longer describes it")
	}
	t.Setenv("BRIOFOLD_AI_PROMPT_FIX_ENABLED", "true")
	if got := studioSafeReplyMode(c, reply, true); got != reply {
		t.Fatalf("customer's own number was blocked: %s", got)
	}
	// A number the customer never sent is still blocked.
	if studioSafeReplyMode(c, "Call 01912345678 for help.", true) == "Call 01912345678 for help." {
		t.Fatal("invented number escaped the filter")
	}
}
