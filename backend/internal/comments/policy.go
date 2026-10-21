// Package comments evaluates post-scoped rules without provider side effects.
package comments

import (
	"errors"
	"math"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

type Rule struct {
	ID         string   `json:"id"`
	Revision   int64    `json:"revision"`
	Enabled    bool     `json:"enabled"`
	Name       string   `json:"name"`
	Connection string   `json:"connection_id"`
	Posts      string   `json:"posts"`
	Selected   []string `json:"selected"`
	Excluded   []string `json:"excluded"`
	Match      string   `json:"match"`
	Keywords   []string `json:"keywords"`
	Intent     string   `json:"intent"`
	Threshold  float64  `json:"threshold"`
	Mode       string   `json:"mode"`
	Reply      string   `json:"reply"`
	Action     string   `json:"action"`
}
type Classification struct {
	Intent     string  `json:"intent"`
	Confidence float64 `json:"confidence"`
}
type Decision struct {
	Rule                string `json:"rule_id"`
	Mode                string `json:"mode"`
	Action              string `json:"action"`
	Reply               string `json:"reply"`
	Reason              string `json:"reason"`
	NeedsClassification bool   `json:"needs_classification"`
}

var identifier = regexp.MustCompile(`^[0-9A-Za-z_-]{1,100}$`)
var email = regexp.MustCompile(`[a-zA-Z0-9.!#$%&'*+/=?^_` + "`" + `{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}`)

func oneOf(s string, values ...string) bool {
	for _, v := range values {
		if s == v {
			return true
		}
	}
	return false
}
func Valid(r Rule) bool {
	if r.Mode == "ai" && r.Action != "reply" {
		return false
	}
	if !utf8.ValidString(r.Name) || len(r.Name) > 400 || utf8.RuneCountInString(strings.TrimSpace(r.Name)) < 1 || utf8.RuneCountInString(r.Name) > 120 || r.Revision < 0 || !oneOf(r.Posts, "all", "selected") || len(r.Selected) > 100 || len(r.Excluded) > 100 || r.Posts == "selected" && len(r.Selected) == 0 || !oneOf(r.Match, "all", "keyword", "intent") || len(r.Keywords) > 20 || r.Match == "keyword" && len(r.Keywords) == 0 || !oneOf(r.Intent, "", "purchase", "question", "complaint", "other") || r.Match == "intent" && r.Intent == "" || math.IsNaN(r.Threshold) || math.IsInf(r.Threshold, 0) || r.Threshold < .5 || r.Threshold > 1 || !oneOf(r.Mode, "fixed", "ai", "human") || !oneOf(r.Action, "reply", "hide", "delete", "review") || !utf8.ValidString(r.Reply) || utf8.RuneCountInString(r.Reply) > 2000 || r.Mode == "fixed" && r.Action == "reply" && strings.TrimSpace(r.Reply) == "" {
		return false
	}
	for _, id := range append(append([]string{}, r.Selected...), r.Excluded...) {
		if !identifier.MatchString(id) {
			return false
		}
	}
	for _, word := range r.Keywords {
		if !utf8.ValidString(word) || utf8.RuneCountInString(strings.TrimSpace(word)) < 1 || utf8.RuneCountInString(word) > 100 {
			return false
		}
	}
	return true
}
func contains(values []string, s string) bool {
	for _, v := range values {
		if v == s {
			return true
		}
	}
	return false
}
func normalized(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }
func phrase(text, word string) bool {
	for start := 0; start <= len(text); {
		at := strings.Index(text[start:], word)
		if at < 0 {
			return false
		}
		at += start
		end := at + len(word)
		left, right := true, true
		if at > 0 {
			r, _ := utf8.DecodeLastRuneInString(text[:at])
			left = !unicode.IsLetter(r) && !unicode.IsNumber(r) && !unicode.IsMark(r)
		}
		if end < len(text) {
			r, _ := utf8.DecodeRuneInString(text[end:])
			right = !unicode.IsLetter(r) && !unicode.IsNumber(r) && !unicode.IsMark(r)
		}
		if left && right {
			return true
		}
		start = at + 1
	}
	return false
}
func Sensitive(text string) bool {
	if email.MatchString(text) {
		return true
	}
	digits := 0
	for _, r := range text {
		if unicode.IsDigit(r) {
			digits++
			if digits >= 7 {
				return true
			}
		} else if !strings.ContainsRune(" +()-.", r) {
			digits = 0
		}
	}
	return false
}
func Complaint(text string) bool {
	text = normalized(text)
	for _, word := range []string{"refund", "scam", "fraud", "complaint", "ফেরত", "প্রতারণা", "অভিযোগ", "রিফান্ড"} {
		if phrase(text, word) {
			return true
		}
	}
	return false
}
func Decide(rules []Rule, connection, post, text string, c *Classification) (Decision, error) {
	review := Decision{Mode: "human", Action: "review", Reason: "NO_MATCH"}
	if !identifier.MatchString(post) || !utf8.ValidString(text) || utf8.RuneCountInString(text) > 8000 || strings.TrimSpace(text) == "" || len(rules) > 50 {
		return review, errors.New("invalid comment")
	}
	if Sensitive(text) {
		review.Reason = "PII_REVIEW_REQUIRED"
		return review, nil
	}
	if Complaint(text) {
		review.Reason = "COMPLAINT_REVIEW_REQUIRED"
		return review, nil
	}
	for _, r := range rules {
		if !Valid(r) {
			return review, errors.New("invalid rule")
		}
		if !r.Enabled || r.Connection != connection || contains(r.Excluded, post) || r.Posts == "selected" && !contains(r.Selected, post) {
			continue
		}
		matched := r.Match == "all"
		if r.Match == "keyword" {
			for _, word := range r.Keywords {
				if phrase(normalized(text), normalized(word)) {
					matched = true
					break
				}
			}
		}
		if r.Match == "intent" {
			if c == nil {
				return Decision{Rule: r.ID, Mode: "human", Action: "review", Reason: "CLASSIFICATION_REQUIRED", NeedsClassification: true}, nil
			}
			if !oneOf(c.Intent, "purchase", "question", "complaint", "other") || math.IsNaN(c.Confidence) || math.IsInf(c.Confidence, 0) || c.Confidence < 0 || c.Confidence > 1 {
				return review, errors.New("invalid classification")
			}
			if c.Intent == "complaint" {
				review.Reason = "COMPLAINT_REVIEW_REQUIRED"
				return review, nil
			}
			if c.Confidence < r.Threshold {
				return Decision{Rule: r.ID, Mode: "human", Action: "review", Reason: "LOW_CONFIDENCE"}, nil
			}
			matched = c.Intent == r.Intent
		}
		if matched {
			d := Decision{Rule: r.ID, Mode: r.Mode, Action: r.Action, Reply: r.Reply, Reason: "RULE_MATCH"}
			if r.Mode == "human" || r.Action == "review" {
				d.Mode = "human"
				d.Action = "review"
				d.Reply = ""
			}
			return d, nil
		}
	}
	return review, nil
}
