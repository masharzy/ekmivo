package comments

import (
	"math"
	"strings"
	"testing"
)

func fixture() Rule {
	return Rule{ID: "rule", Revision: 1, Enabled: true, Name: "Price reply", Connection: "conn", Posts: "selected", Selected: []string{"post_1"}, Excluded: []string{"post_2"}, Match: "keyword", Keywords: []string{"price", "দাম"}, Threshold: .9, Mode: "fixed", Reply: "See the catalog.", Action: "reply"}
}
func TestUnicodePostsAndSensitiveGuards(t *testing.T) {
	r := fixture()
	for _, c := range []struct{ post, text, reason string }{{"post_1", "What is the price?", "RULE_MATCH"}, {"post_1", "দাম কত?", "RULE_MATCH"}, {"post_1", "priceless gift", "NO_MATCH"}, {"post_2", "price", "NO_MATCH"}, {"post_3", "price", "NO_MATCH"}, {"post_1", "price refund", "COMPLAINT_REVIEW_REQUIRED"}, {"post_1", "price ০১৭১২৩৪৫৬৭৮", "PII_REVIEW_REQUIRED"}, {"post_1", "price me@example.com", "PII_REVIEW_REQUIRED"}} {
		d, e := Decide([]Rule{r}, "conn", c.post, c.text, nil)
		if e != nil || d.Reason != c.reason {
			t.Fatalf("%+v => %+v %v", c, d, e)
		}
	}
	r.Posts = "all"
	d, _ := Decide([]Rule{r}, "conn", "post_3", "price", nil)
	if d.Reason != "RULE_MATCH" {
		t.Fatal(d)
	}
	d, _ = Decide([]Rule{r}, "another", "post_1", "price", nil)
	if d.Reason != "NO_MATCH" {
		t.Fatal("connection leak")
	}
}
func TestIntentConfidenceAndValidation(t *testing.T) {
	r := fixture()
	r.Match = "intent"
	r.Intent = "purchase"
	r.Mode = "ai"
	d, _ := Decide([]Rule{r}, "conn", "post_1", "I want one", nil)
	if !d.NeedsClassification {
		t.Fatal(d)
	}
	d, _ = Decide([]Rule{r}, "conn", "post_1", "I want one", &Classification{"purchase", .89})
	if d.Reason != "LOW_CONFIDENCE" {
		t.Fatal(d)
	}
	d, _ = Decide([]Rule{r}, "conn", "post_1", "I want one", &Classification{"purchase", .95})
	if d.Mode != "ai" {
		t.Fatal(d)
	}
	for _, n := range []float64{math.NaN(), math.Inf(1), -1, 1.1} {
		if _, e := Decide([]Rule{r}, "conn", "post_1", "I want one", &Classification{"purchase", n}); e == nil {
			t.Fatal("invalid score")
		}
	}
	if _, e := Decide([]Rule{r}, "conn", "post_1", strings.Repeat("ক", 8001), nil); e == nil {
		t.Fatal("unbounded comment")
	}
}
func TestMalformedRulesFailClosed(t *testing.T) {
	for _, mutate := range []func(*Rule){func(r *Rule) { r.Posts = "any" }, func(r *Rule) { r.Selected = nil }, func(r *Rule) { r.Threshold = 0 }, func(r *Rule) { r.Action = "ban" }, func(r *Rule) { r.Reply = "" }, func(r *Rule) { r.Keywords = []string{" "} }, func(r *Rule) { r.Selected = []string{"../../other"} }} {
		r := fixture()
		mutate(&r)
		if Valid(r) {
			t.Fatal("invalid rule accepted")
		}
	}
}
