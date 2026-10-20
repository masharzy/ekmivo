package checkout

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestInboxWebhookSignature(t *testing.T) {
	raw := []byte(`{"entry":[]}`)
	mac := hmac.New(sha256.New, []byte("fixture-secret"))
	mac.Write(raw)
	sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if !inboxWebhookSignature("fixture-secret", sig, raw) {
		t.Fatal("valid signature rejected")
	}
	if inboxWebhookSignature("fixture-secret", sig, []byte(`{"tampered":true}`)) {
		t.Fatal("tampered body accepted")
	}
	if inboxWebhookSignature("", sig, raw) {
		t.Fatal("unconfigured verifier accepted")
	}
}
func TestInboxStatusesUseProviderTimesOnly(t *testing.T) {
	raw := []byte(`{"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"123"},"statuses":[{"id":"wamid.1","status":"read","timestamp":"1792400000"}]}}]}]}`)
	events := parseInboxStatuses(raw)
	if len(events) != 1 || events[0].Status != "seen" || events[0].At.Unix() != 1792400000 || events[0].Message != "wamid.1" {
		t.Fatal("actual read event not normalized")
	}
	if len(parseInboxStatuses([]byte(`{"entry":[]}`))) != 0 {
		t.Fatal("empty event fabricated a status")
	}
}

func TestInstagramSeenMessageID(t *testing.T) {
	events := parseInboxStatuses([]byte(`{"object":"instagram","entry":[{"id":"account","messaging":[{"sender":{"id":"customer"},"timestamp":1792400000000,"read":{"mid":"ig.message"}}]}]}`))
	if len(events) != 1 || events[0].Watermark || events[0].Message != "ig.message" || events[0].Status != "seen" {
		t.Fatal("Instagram read ID missing")
	}
}
