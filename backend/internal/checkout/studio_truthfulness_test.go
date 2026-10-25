package checkout

import (
	"encoding/json"
	"testing"
)

func TestStudioReplyRejectsObservedFalsePromises(t *testing.T) {
	var c studioContext
	c.Config.Language = "auto"
	c.Question = "Link pathaw"
	c.Config.Instructions = "Business: Ekmivo. Payment Gateway costs BDT 50/month."
	for _, reply := range []string{
		"Ami immediate link generate kore dite parbo.",
		"Ami apnar jonno bKash payment link generate korchi. Ekto opekkhon korun.",
		"I will send your payment link immediately.",
		"I am generating a payment link now.",
		"I have activated your subscription.",
		"I cannot verify a payment. I will send your payment link.",
		"I cannot verify a payment, but I will send your payment link.",
		"আমি আপনার পেমেন্ট লিংক তৈরি করছি। অপেক্ষা করুন।",
		"Would you like me to provide their contact details?",
		"Apni ki chan ami support team er contact details gulo diye dei?",
		"Visit https://invented.example/pay now.",
		"Call 01912345678 for support.",
	} {
		if studioSafeReply(c, reply) == reply {
			t.Errorf("unsupported reply escaped boundary: %s", reply)
		}
	}
}

func TestStudioReplyKeepsGroundedAnswersAndHonestLimits(t *testing.T) {
	var c studioContext
	c.Question = "payment?"
	c.Config.Instructions = "Business: Ekmivo. Website https://example.com/help?a=1&b=2. Support 01912345678."
	for _, reply := range []string{
		"The payment gateway costs BDT 50/month.",
		"I cannot generate a payment link in this chat.",
		"I can explain how to generate a payment link from the dashboard.",
		"The gateway can generate payment links; this chat cannot.",
		"Ami payment link generate korte pari na.",
		"আমি পেমেন্ট লিংক তৈরি করতে পারি না।",
		"Use https://example.com/help?a=1&b=2 for details.",
		"Support: 01912345678.",
	} {
		if got := studioSafeReply(c, reply); got != reply {
			t.Errorf("grounded or honest answer replaced: %s => %s", reply, got)
		}
	}
	// A previous assistant's invented URL must never authorize a later reply.
	_ = json.Unmarshal([]byte(`{"history":[{"sender":"ai","text":"https://invented.example/pay"}]}`), &c)
	if got := studioSafeReply(c, "Pay at https://invented.example/pay"); got == "Pay at https://invented.example/pay" {
		t.Fatal("AI history authorized an invented URL")
	}
}

func TestStudioLanguagePolicy(t *testing.T) {
	for _, tc := range []struct{ question, want string }{
		{"এই পণ্য আছে?", "bn"}, {"Ei product ache?", "bn"},
		{"Link pathaw", "bn"}, {"Apnar service er dam koto?", "bn"},
		{"Is this product available?", "en"}, {"Please send a payment link", "en"},
	} {
		var c studioContext
		c.Question = tc.question
		c.Config.Language = "en"
		if got := studioReplyLanguage(c); got != tc.want {
			t.Errorf("%q: %s, want %s", tc.question, got, tc.want)
		}
		got := studioSafeReply(c, "I will send your payment link immediately.")
		if tc.want == "bn" && !studioBengaliScript.MatchString(got) {
			t.Errorf("non-Bengali fallback for %q: %s", tc.question, got)
		}
	}
	var c studioContext
	c.Question = "???"
	c.History = append(c.History, struct {
		Sender string `json:"sender"`
		Text   string `json:"text"`
	}{Sender: "customer", Text: "Eta ache?"})
	if studioReplyLanguage(c) != "bn" {
		t.Fatal("follow-up lost customer language")
	}
}
