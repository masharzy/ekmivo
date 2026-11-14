package checkout

import (
	"strings"
	"testing"
)

// The v2 prompt is derived from the legacy one by exact replacement; if the legacy text changes the replacements
// silently stop applying, so this test pins every part of the new payment conversation.
func TestAIToolPromptV2(t *testing.T) {
	p := aiToolPromptV2()
	for _, want := range []string{"- verify_payment {", "- change_payment_method {", "ask ONLY for the number they paid from", "- update_order_address {",
		`next "ask_transaction_id"`, "never ask for them again", `only when a tool result in this turn has status "confirmed"`} {
		if !strings.Contains(p, want) {
			t.Errorf("v2 prompt lacks %q", want)
		}
	}
	for _, gone := range []string{"submit_payment_proof", "Ask for name, phone and address before ask_payment_choice.", `never "confirmed"`} {
		if strings.Contains(p, gone) {
			t.Errorf("v2 prompt still has %q", gone)
		}
	}
	if !strings.Contains(aiToolPrompt, aiLegacyProofRule) {
		t.Error("the legacy proof paragraph no longer matches aiToolPrompt")
	}
	if !strings.Contains(aiToolPrompt, "submit_payment_proof") {
		t.Error("legacy prompt must stay unchanged")
	}
}

func TestAIPaymentsV2Flag(t *testing.T) {
	t.Setenv("BRIOFOLD_AI_TOOLS_ENABLED", "true")
	t.Setenv("BRIOFOLD_AI_KILL_SWITCH", "")
	t.Setenv("BRIOFOLD_AI_TOOLS_WORKSPACES", "")
	t.Setenv("BRIOFOLD_AI_PAYMENTS_V2_ENABLED", "")
	if aiPaymentsV2EnabledFor("w") {
		t.Fatal("payments v2 must be off without its flag")
	}
	t.Setenv("BRIOFOLD_AI_PAYMENTS_V2_ENABLED", "true")
	if !aiPaymentsV2EnabledFor("w") {
		t.Fatal("payments v2 should follow its flag")
	}
	t.Setenv("BRIOFOLD_AI_TOOLS_ENABLED", "")
	if aiPaymentsV2EnabledFor("w") {
		t.Fatal("payments v2 needs AI tools enabled")
	}
	for _, tool := range []string{"verify_payment", "change_payment_method"} {
		if !aiToolNames[tool] || !aiActingTools[tool] {
			t.Errorf("%s must be a known acting tool", tool)
		}
	}
}
