package checkout

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAIAddBDT(t *testing.T) {
	var v map[string]any
	_ = json.Unmarshal([]byte(`{"total_minor":16000,"lines":[{"unit_minor":2050,"quantity":5}],"order":{"due_now_minor":0},"price":3,"x_minor":"text"}`), &v)
	got, _ := aiAddBDT(v).(map[string]any)
	raw, _ := json.Marshal(got)
	for _, want := range []string{`"total_bdt":"160"`, `"unit_bdt":"20.50"`, `"due_now_bdt":"0"`, `"total_minor":16000`} {
		if !strings.Contains(string(raw), want) {
			t.Fatalf("missing %s in %s", want, raw)
		}
	}
	if strings.Contains(string(raw), "x_bdt") {
		t.Fatal("non-numeric minor value must not get a bdt twin")
	}
	if aiFormatBDT(-150) != "-1.50" || aiFormatBDT(5) != "0.05" {
		t.Fatal("format")
	}
}

func TestAIMessengerButtons(t *testing.T) {
	one := []aiProductCard{{Name: "Alu", Buttons: []aiCardButton{{Label: "অর্ডার করুন · ১ কেজি", Token: "tok1"}}}}
	p := aiMessengerButtons("r1", "জি, আলু আছে, ২০ টাকা।", one)
	raw, _ := json.Marshal(p)
	if p == nil || !strings.Contains(string(raw), `"template_type":"button"`) || !strings.Contains(string(raw), "জি, আলু আছে") || !strings.Contains(string(raw), "tok1") {
		t.Fatalf("reply text and button must travel together: %s", raw)
	}
	if aiMessengerButtons("r1", "", one) != nil || aiMessengerButtons("r1", strings.Repeat("ক", 641), one) != nil {
		t.Fatal("empty or long text must fall back to plain text")
	}
	many := []aiProductCard{{Name: "A", Buttons: []aiCardButton{{Token: "1"}, {Token: "2"}}}, {Name: "B", Buttons: []aiCardButton{{Token: "3"}, {Token: "4"}}}}
	if aiMessengerButtons("r1", "text", many) != nil {
		t.Fatal("more than three buttons must fall back to plain text")
	}
}

func TestAIButtonTurnLanguage(t *testing.T) {
	t.Setenv("BRIOFOLD_AI_SELLING_FIXES_ENABLED", "true")
	button := "I would like to order variant 6f2be23a-d38c-4484-bade-1321249b9a19."
	var c studioContext
	if err := json.Unmarshal([]byte(`{"question":"`+button+`","history":[{"sender":"customer","text":"আলু আছে?"},{"sender":"ai","text":"Yes"}]}`), &c); err != nil {
		t.Fatal(err)
	}
	if got := studioReplyLanguage(c); got != "bn" {
		t.Fatalf("button after Bengali: %s", got)
	}
	c.History = c.History[:0]
	if got := studioReplyLanguage(c); got != "bn" {
		t.Fatalf("button alone: %s", got)
	}
	c.Config.Language = "en"
	if got := studioReplyLanguage(c); got != "en" {
		t.Fatalf("button alone, English shop: %s", got)
	}
	c.Question = "Do you have potatoes?"
	if got := studioReplyLanguage(c); got != "en" {
		t.Fatalf("English question: %s", got)
	}
}
